"""
Limpia todos los multipart uploads incompletos en R2 y configura
una lifecycle rule para que se aborte automáticamente a los 7 días.

Uso en el VPS:
  cd /var/www/radiologia-maca
  docker compose -f docker-compose.prod.yml exec backend python /app/scripts/cleanup_r2_multipart.py
"""
import os
import boto3
from botocore.config import Config

account_id = os.environ["R2_ACCOUNT_ID"]
access_key = os.environ["R2_ACCESS_KEY"]
secret_key = os.environ["R2_SECRET_KEY"]
bucket     = os.environ.get("R2_BUCKET", "maca-radiologia")

s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
    aws_access_key_id=access_key,
    aws_secret_access_key=secret_key,
    config=Config(signature_version="s3v4"),
    region_name="auto",
)

# ── 1. Listar y abortar uploads incompletos ───────────────────────────────────
print(f"Buscando multipart uploads incompletos en '{bucket}'…")
aborted = 0
paginator = s3.get_paginator("list_multipart_uploads")
try:
    for page in paginator.paginate(Bucket=bucket):
        for upload in page.get("Uploads", []):
            key       = upload["Key"]
            upload_id = upload["UploadId"]
            s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
            print(f"  Abortado: {key[:80]}")
            aborted += 1
except s3.exceptions.NoSuchBucket:
    print("ERROR: bucket no encontrado.")
    raise

print(f"\nTotal abortados: {aborted}")

# ── 2. Lifecycle rule: abortar incompletos tras 7 días ────────────────────────
print("\nConfigurando lifecycle rule (abort after 7 days)…")
s3.put_bucket_lifecycle_configuration(
    Bucket=bucket,
    LifecycleConfiguration={
        "Rules": [{
            "ID": "abort-incomplete-multipart-7d",
            "Status": "Enabled",
            "Filter": {"Prefix": ""},
            "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
        }]
    },
)
print("Lifecycle rule configurada.")
print("\nListo.")
