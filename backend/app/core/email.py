"""
Email service for sending reminder notifications.
Uses SMTP (compatible with Gmail / Google Workspace).
"""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _get_smtp_config() -> dict:
    """Get SMTP configuration from settings."""
    settings = get_settings()
    return {
        "host": getattr(settings, "smtp_host", "smtp.gmail.com"),
        "port": int(getattr(settings, "smtp_port", 587)),
        "username": getattr(settings, "smtp_username", ""),
        "password": getattr(settings, "smtp_password", ""),
        "from_email": getattr(settings, "smtp_from_email", "")
            or getattr(settings, "smtp_username", ""),
        "from_name": getattr(settings, "smtp_from_name", "Guardian's Embrace"),
        "use_starttls": bool(getattr(settings, "smtp_use_starttls", True)),
        "use_ssl": bool(getattr(settings, "smtp_use_ssl", False)),
        "validate_certs": bool(getattr(settings, "smtp_validate_certs", True)),
    }


def is_email_configured() -> bool:
    """Check if SMTP email is properly configured."""
    cfg = _get_smtp_config()
    return bool(cfg["username"] and cfg["password"])


def send_email(
    to_emails: List[str],
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> dict:
    """
    Send an email to one or more recipients using SMTP.
    Returns a dict with success status and details.
    """
    cfg = _get_smtp_config()

    if not cfg["username"] or not cfg["password"]:
        logger.warning("SMTP not configured — skipping email send")
        return {"success": False, "error": "SMTP not configured", "sent_to": []}

    sent_to = []
    errors = []

    try:
        tls_context = ssl.create_default_context()
        if not cfg["validate_certs"]:
            tls_context.check_hostname = False
            tls_context.verify_mode = ssl.CERT_NONE

        if cfg["use_ssl"]:
            server_context = smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=tls_context)
        else:
            server_context = smtplib.SMTP(cfg["host"], cfg["port"])

        with server_context as server:
            server.ehlo()
            if cfg["use_starttls"] and not cfg["use_ssl"]:
                server.starttls(context=tls_context)
                server.ehlo()
            server.login(cfg["username"], cfg["password"])

            for to_email in to_emails:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
                    msg["To"] = to_email

                    if text_body:
                        msg.attach(MIMEText(text_body, "plain"))
                    msg.attach(MIMEText(html_body, "html"))

                    server.sendmail(cfg["from_email"], to_email, msg.as_string())
                    sent_to.append(to_email)
                    logger.info(f"Email sent to {to_email}")
                except Exception as e:
                    logger.error(f"Failed to send email to {to_email}: {e}")
                    errors.append({"email": to_email, "error": str(e)})

    except Exception as e:
        logger.error(f"SMTP connection failed: {e}")
        return {"success": False, "error": str(e), "sent_to": sent_to}

    return {
        "success": len(errors) == 0,
        "sent_to": sent_to,
        "errors": errors,
        "total": len(to_emails),
    }


def build_reminder_html(
    volunteer_name: str,
    week_id: str,
    deadline_str: str,
    portal_url: str = "http://localhost:5173",
) -> str:
    """Build an HTML email body for the weekly check-in reminder."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f9fafb;">
        <div style="max-width:560px;margin:2rem auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <!-- Header -->
            <div style="background:#222326;padding:1.5rem 2rem;text-align:center;">
                <h1 style="margin:0;color:#D4AF37;font-size:1.25rem;font-weight:700;">
                    Guardian's Embrace
                </h1>
                <p style="margin:0.25rem 0 0;color:#9ca3af;font-size:0.8rem;">Volunteer Portal</p>
            </div>
            <!-- Body -->
            <div style="padding:2rem;">
                <p style="margin:0 0 1rem;color:#334155;font-size:0.95rem;">
                    Hi <strong>{volunteer_name}</strong>,
                </p>
                <p style="margin:0 0 1.5rem;color:#334155;font-size:0.95rem;">
                    Friendly reminder — your weekly check-in for <strong>{week_id}</strong> is due by
                    <strong>{deadline_str}</strong>.
                </p>
                <!-- CTA Button -->
                <div style="text-align:center;margin:1.5rem 0;">
                    <a href="{portal_url}/submissions/new"
                       style="display:inline-block;background:#D4AF37;color:white;padding:0.75rem 2rem;
                              border-radius:6px;text-decoration:none;font-weight:600;font-size:0.9rem;">
                        Submit Your Update ✍️
                    </a>
                </div>
                <p style="margin:1.5rem 0 0;color:#64748b;font-size:0.8rem;">
                    It only takes a minute — log your hours, note what you worked on, and you're done!
                </p>
            </div>
            <!-- Footer -->
            <div style="background:#f9fafb;padding:1rem 2rem;border-top:1px solid #e2e8f0;text-align:center;">
                <p style="margin:0;color:#9ca3af;font-size:0.7rem;">
                    You received this because you're a volunteer at Guardian's Embrace.
                </p>
            </div>
        </div>
    </body>
    </html>
    """


def build_invitation_html(
    email: str,
    role: str,
    invited_by: str,
    portal_url: str = "http://localhost:5173",
) -> str:
    """Build an HTML email body for inviting a new user."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body style="margin:0;padding:0;font-family:'Inter',Arial,sans-serif;background:#f9fafb;">
        <div style="max-width:560px;margin:2rem auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            <!-- Header -->
            <div style="background:#222326;padding:1.5rem 2rem;text-align:center;">
                <h1 style="margin:0;color:#D4AF37;font-size:1.25rem;font-weight:700;">
                    Guardian's Embrace
                </h1>
                <p style="margin:0.25rem 0 0;color:#9ca3af;font-size:0.8rem;">Volunteer Portal</p>
            </div>
            <!-- Body -->
            <div style="padding:2rem;">
                <p style="margin:0 0 1rem;color:#334155;font-size:0.95rem;">
                    Hello!
                </p>
                <p style="margin:0 0 1.5rem;color:#334155;font-size:0.95rem;">
                    You have been invited to join the <strong>Guardian's Embrace Volunteer Portal</strong>.
                </p>
                <div style="background:#f3f4f6;padding:1rem;border-radius:6px;margin-bottom:1.5rem;">
                    <p style="margin:0;color:#374151;font-size:0.9rem;">
                        <strong>Role:</strong> {role.title()}<br>
                        <strong>Invited By:</strong> {invited_by}
                    </p>
                </div>
                <!-- CTA Button -->
                <div style="text-align:center;margin:1.5rem 0;">
                    <a href="{portal_url}/login"
                       style="display:inline-block;background:#D4AF37;color:white;padding:0.75rem 2rem;
                              border-radius:6px;text-decoration:none;font-weight:600;font-size:0.9rem;">
                        Accept Invitation & Login
                    </a>
                </div>
                <p style="margin:1.5rem 0 0;color:#64748b;font-size:0.8rem;">
                    Please login using your Google account: <strong>{email}</strong>.
                </p>
            </div>
            <!-- Footer -->
            <div style="background:#f9fafb;padding:1rem 2rem;border-top:1px solid #e2e8f0;text-align:center;">
                <p style="margin:0;color:#9ca3af;font-size:0.7rem;">
                    If you believe this invitation was sent in error, you can safely ignore this email.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
