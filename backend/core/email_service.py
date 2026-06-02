import logging
import resend
from core.config import settings

logger = logging.getLogger(__name__)


def email_configurado() -> bool:
    return bool(settings.RESEND_API_KEY)


def _html(body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;">
  <tr><td align="center" style="padding:36px 16px;">
    <table width="560" cellpadding="0" cellspacing="0"
           style="background:#FFFFFF;border:2px solid #2563EB;max-width:560px;width:100%;">
      <tr>
        <td style="background:#2563EB;padding:20px 28px;">
          <span style="font-size:20px;font-weight:900;color:#FFFFFF;font-family:Arial,sans-serif;">
            Radiología · Dra. Macarena
          </span>
        </td>
      </tr>
      <tr><td style="padding:32px 28px 24px;">{body}</td></tr>
      <tr>
        <td style="background:#F8FAFC;border-top:2px solid #2563EB;padding:16px 28px;">
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
  <tr><td style="background:#2563EB;padding:0;">
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


def _send(to: str, subject: str, html: str,
          attachments: list[tuple[str, bytes, str]] | None = None) -> tuple[bool, str]:
    if not email_configurado():
        return False, "Resend no configurado (falta RESEND_API_KEY)."

    resend.api_key = settings.RESEND_API_KEY
    params: resend.Emails.SendParams = {
        "from": settings.EMAIL_FROM,
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


# Alias para no romper código existente que llame smtp_configurado()
smtp_configurado = email_configurado


def enviar_magic_link_portal(derivador, link: str, radiologo_nombre: str = "Radiología") -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h("Acceso a su Portal")
        + _p(f"Dr./Dra. <strong>{derivador.nombre}</strong>, use el enlace de abajo "
             "para ingresar a su portal. Válido por <strong>24 horas</strong>.")
        + _btn("Ingresar al portal", link)
        + _p(f"<span style='font-size:11px;color:#94A3B8;'>Enlace: {link}</span>")
    )
    return _send(derivador.email, f"Acceso a su Portal · {radiologo_nombre}", _html(body))


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
        + _p(f"Dr./Dra. <strong>{derivador.nombre}</strong>, el informe de su paciente "
             f"<strong>{paciente.nombre_completo}</strong> está disponible.")
        + _table(
            _row("Paciente", paciente.nombre_completo),
            _row("RUT", paciente.rut or "-"),
            _row("Examen", examen.tipo_examen),
        )
        + _btn("Descargar informe PDF", link_pdf)
        + _btn("Ver en el portal", link_portal)
    )
    return _send(
        derivador.email,
        f"Informe listo · {paciente.nombre_completo} · {examen.tipo_examen} · {radiologo_nombre}",
        _html(body),
    )


def enviar_honorarios(derivador, periodo: str, pdf_bytes: bytes) -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h(f"Honorarios {periodo}")
        + _p(f"Dr./Dra. <strong>{derivador.nombre}</strong>, adjuntamos el resumen de honorarios "
             f"correspondiente al período <strong>{periodo}</strong>.")
    )
    nombre_archivo = f"honorarios_{derivador.id}_{periodo}.pdf"
    return _send(
        derivador.email,
        f"Honorarios {periodo} · Dra. Macarena",
        _html(body),
        attachments=[("application/pdf", pdf_bytes, nombre_archivo)],
    )


def enviar_incidencia_a_derivador(derivador, paciente, examen, comentario: str) -> tuple[bool, str]:
    if not derivador.email:
        return False, "Derivador sin email."
    body = (
        _h("Incidencia en un examen")
        + _p(f"Dr./Dra. <strong>{derivador.nombre}</strong>, la Dra. Macarena ha registrado "
             f"una incidencia en el siguiente examen.")
        + _table(
            _row("Paciente", paciente.nombre_completo),
            _row("RUT", paciente.rut or "—"),
            _row("Examen", examen.tipo_examen),
        )
        + _p(f"<strong>Comentario:</strong><br>{comentario}")
        + _p("Por favor ingresa a tu portal para revisar y responder esta incidencia.")
    )
    return _send(
        derivador.email,
        f"Incidencia · {paciente.nombre_completo} · {examen.tipo_examen}",
        _html(body),
    )
