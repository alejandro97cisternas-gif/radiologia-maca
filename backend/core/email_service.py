import logging
import resend
from core.config import settings

logger = logging.getLogger(__name__)


def email_configurado() -> bool:
    return bool(settings.RESEND_API_KEY) or bool(settings.SMTP_USER and settings.SMTP_PASSWORD)


def _html(body: str, titulo: str = "Radiología") -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;">
  <tr><td align="center" style="padding:36px 16px;">
    <table width="560" cellpadding="0" cellspacing="0"
           style="background:#FFFFFF;border:2px solid #1e3a5f;max-width:560px;width:100%;">
      <tr>
        <td style="background:#1e3a5f;padding:20px 28px;">
          <span style="font-size:20px;font-weight:900;color:#FFFFFF;font-family:Arial,sans-serif;">
            {titulo}
          </span>
        </td>
      </tr>
      <tr><td style="padding:32px 28px 24px;">{body}</td></tr>
      <tr>
        <td style="background:#F8FAFC;border-top:2px solid #1e3a5f;padding:16px 28px;">
          <p style="margin:0;font-size:10px;color:#94A3B8;">
            Correo generado automáticamente · No responder este mensaje
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _btn(label: str, url: str) -> str:
    return f"""<table cellpadding="0" cellspacing="0" style="margin-top:20px;">
  <tr><td style="background:#1e3a5f;padding:0;">
    <a href="{url}" style="display:inline-block;padding:12px 28px;color:#FFF;
       font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">
      {label} →
    </a>
  </td></tr>
</table>"""


def _row(label: str, value: str) -> str:
    return f"""<tr>
  <td style="padding:7px 12px;font-size:12px;color:#64748B;font-weight:600;
     border-bottom:1px solid #E2E8F0;white-space:nowrap;">{label}</td>
  <td style="padding:7px 12px;font-size:12px;color:#0F172A;
     border-bottom:1px solid #E2E8F0;">{value}</td>
</tr>"""


def _table(*rows: str) -> str:
    return (f"<table cellpadding='0' cellspacing='0' width='100%' "
            f"style='margin-top:20px;border:1px solid #E2E8F0;border-collapse:collapse;'>"
            + "".join(rows) + "</table>")


def _h(text: str) -> str:
    return (f"<p style='margin:0 0 6px;font-size:20px;font-weight:700;"
            f"color:#0F172A;font-family:Arial,sans-serif;'>{text}</p>")


def _p(text: str) -> str:
    return f"<p style='margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;'>{text}</p>"


def _from_addr(nombre: str | None) -> str:
    """Construye 'Nombre <direccion>' dinámicamente por tenant."""
    import re
    base = settings.EMAIL_ADDRESS
    if not base:
        # Extrae la dirección del EMAIL_FROM: "Nombre <addr>" → "addr"
        m = re.search(r"<(.+?)>", settings.EMAIL_FROM)
        base = m.group(1) if m else settings.EMAIL_FROM
    if nombre:
        return f"{nombre} <{base}>"
    return settings.EMAIL_FROM


def _send(to: str, subject: str, html: str,
          attachments: list[tuple[str, bytes, str]] | None = None,
          from_name: str | None = None) -> tuple[bool, str]:
    if not email_configurado():
        return False, "Email no configurado (falta RESEND_API_KEY o SMTP_USER/SMTP_PASSWORD)."

    from_addr = _from_addr(from_name)
    if settings.RESEND_API_KEY:
        return _send_resend(to, subject, html, attachments, from_addr)
    return _send_smtp(to, subject, html, attachments, from_addr)


def _send_resend(to: str, subject: str, html: str,
                 attachments: list[tuple[str, bytes, str]] | None = None,
                 from_addr: str | None = None) -> tuple[bool, str]:
    resend.api_key = settings.RESEND_API_KEY
    params: resend.Emails.SendParams = {
        "from": from_addr or settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if attachments:
        params["attachments"] = [
            {"filename": filename, "content": list(data)}
            for _, data, filename in attachments
        ]
    try:
        resend.Emails.send(params)
        return True, f"Enviado a {to}"
    except Exception as e:
        logger.error("Resend error: %s", e)
        return False, str(e)


def _send_smtp(to: str, subject: str, html: str,
               attachments: list[tuple[str, bytes, str]] | None = None,
               from_addr: str | None = None) -> tuple[bool, str]:
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders

    msg = MIMEMultipart("mixed")
    msg["From"] = from_addr or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html", "utf-8"))

    if attachments:
        for _, data, filename in attachments:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(data)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
            msg.attach(part)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, to, msg.as_string())
        return True, f"Enviado a {to}"
    except Exception as e:
        logger.error("SMTP error: %s", e)
        return False, str(e)


# Alias para no romper código existente que llame smtp_configurado()
smtp_configurado = email_configurado


def enviar_magic_link_portal(derivador, link: str, radiologo_nombre: str = "Radiología") -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h(f"Bienvenido/a al portal — {derivador.nombre}")
        + _p(
            f"Estimado/a <strong>{derivador.nombre}</strong>, a partir de ahora "
            f"<strong>{radiologo_nombre}</strong> utiliza esta plataforma para la gestión "
            f"de solicitudes e informes radiológicos."
        )
        + _p(
            "A través de su portal podrá <strong>enviar imágenes y solicitudes de exámenes</strong>, "
            "hacer seguimiento del estado de sus casos y acceder a los informes finalizados "
            "en cuanto estén disponibles."
        )
        + _p(
            "La primera vez que ingrese, un <strong>tutorial paso a paso</strong> lo guiará "
            "por las funciones principales de la plataforma."
        )
        + _p("El enlace de acceso es válido por <strong>24 horas</strong>.")
        + _btn("Ingresar al portal", link)
        + _p(f"<span style='font-size:11px;color:#94A3B8;'>Si el botón no funciona, copie este enlace en su navegador: {link}</span>")
    )
    titulo = f"Radiología · {radiologo_nombre}" if radiologo_nombre else "Radiología"
    return _send(derivador.email, f"Acceso a su portal · {derivador.nombre} · {radiologo_nombre}", _html(body, titulo), from_name=radiologo_nombre or None)


def enviar_tarea_pendiente_a_doctora(derivador, paciente, examen, radiologo_email: str = "") -> tuple[bool, str]:
    if not radiologo_email:
        return False, "Email del radiólogo no configurado."
    body = (
        _h("Nueva tarea pendiente")
        + _p(f"La clínica <strong>{derivador.nombre}</strong> subió un nuevo examen.")
        + _table(
            _row("Paciente", paciente.nombre_completo),
            _row("RUT", paciente.rut or "-"),
            _row("Tipo de examen", examen.tipo_examen),
            _row("Clínica", derivador.nombre),
        )
    )
    return _send(
        radiologo_email,
        f"Nueva tarea: {examen.tipo_examen} · {paciente.nombre_completo}",
        _html(body),
    )



def enviar_informe_listo_a_derivador(
    derivador, paciente, examen, link_pdf: str, link_portal: str, radiologo_nombre: str = "Radiología"
) -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h("Informe listo")
        + _p(f"centro <strong>{derivador.nombre}</strong>, el informe de su paciente "
             f"<strong>{paciente.nombre_completo}</strong> está disponible.")
        + _table(
            _row("Paciente", paciente.nombre_completo),
            _row("RUT", paciente.rut or "-"),
            _row("Examen", examen.tipo_examen),
        )
        + _btn("Descargar informe PDF", link_pdf)
        + _btn("Ver en el portal", link_portal)
    )
    titulo = f"Radiología · {radiologo_nombre}" if radiologo_nombre else "Radiología"
    return _send(
        derivador.email,
        f"Informe listo · {paciente.nombre_completo} · {examen.tipo_examen} · {radiologo_nombre}",
        _html(body, titulo),
        from_name=radiologo_nombre or None,
    )


def enviar_honorarios(derivador, periodo: str, pdf_bytes: bytes, radiologo_nombre: str = "") -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h(f"Honorarios {periodo}")
        + _p(f"centro <strong>{derivador.nombre}</strong>, adjuntamos el resumen de honorarios "
             f"correspondiente al período <strong>{periodo}</strong>.")
    )
    titulo = f"Radiología · {radiologo_nombre}" if radiologo_nombre else "Radiología"
    nombre_archivo = f"honorarios_{derivador.id}_{periodo}.pdf"
    return _send(
        derivador.email,
        f"Honorarios {periodo}",
        _html(body, titulo),
        attachments=[("application/pdf", pdf_bytes, nombre_archivo)],
        from_name=radiologo_nombre or None,
    )


def _fila_informe(tipo_examen: str, link_pdf: str) -> str:
    return f"""<tr>
  <td style="padding:7px 12px;font-size:12px;color:#0F172A;border-bottom:1px solid #E2E8F0;">{tipo_examen}</td>
  <td style="padding:7px 12px;border-bottom:1px solid #E2E8F0;text-align:right;">
    <a href="{link_pdf}" style="display:inline-block;padding:5px 14px;background:#1e3a5f;color:#FFF;
       font-size:11px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">
      Descargar PDF →
    </a>
  </td>
</tr>"""


def enviar_caso_listo_a_derivador(
    derivador, paciente, examenes: list, link_portal: str, radiologo_nombre: str = "Radiología"
) -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    filas = [_fila_informe(e["tipo_examen"], e["link_pdf"]) for e in examenes]
    tabla = (
        "<table cellpadding='0' cellspacing='0' width='100%' "
        "style='margin-top:20px;border:1px solid #E2E8F0;border-collapse:collapse;'>"
        + "".join(filas) + "</table>"
    )
    body = (
        _h("Informes listos")
        + _p(f"centro <strong>{derivador.nombre}</strong>, los informes de su paciente "
             f"<strong>{paciente.nombre_completo}</strong> están disponibles.")
        + tabla
        + _btn("Ver en el portal", link_portal)
    )
    titulo = f"Radiología · {radiologo_nombre}" if radiologo_nombre else "Radiología"
    return _send(
        derivador.email,
        f"Informes listos · {paciente.nombre_completo} · {radiologo_nombre}",
        _html(body, titulo),
        from_name=radiologo_nombre or None,
    )


def enviar_incidencia_a_derivador(derivador, paciente, examen, comentario: str, radiologo_nombre: str = "") -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h("Incidencia en un examen")
        + _p(f"centro <strong>{derivador.nombre}</strong>, se ha registrado "
             f"una incidencia en el siguiente examen.")
        + _table(
            _row("Paciente", paciente.nombre_completo),
            _row("RUT", paciente.rut or "—"),
            _row("Examen", examen.tipo_examen),
        )
        + _p(f"<strong>Comentario:</strong><br>{comentario}")
        + _p("Por favor ingresa a tu portal para revisar y responder esta incidencia.")
    )
    titulo = f"Radiología · {radiologo_nombre}" if radiologo_nombre else "Radiología"
    return _send(
        derivador.email,
        f"Incidencia · {paciente.nombre_completo} · {examen.tipo_examen}",
        _html(body, titulo),
        from_name=radiologo_nombre or None,
    )
