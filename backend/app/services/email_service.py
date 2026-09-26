"""Email delivery for Knovi.

Sends transactional emails (password reset, email verification) via SMTP
when SMTP settings are configured. If SMTP is not configured, the caller
can fall back to returning the action link so it still works in development.
"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage


def smtp_configured() -> bool:
    """True when enough SMTP settings exist to actually send mail."""
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def _build_message(to_email: str, subject: str, html_body: str, text_body: str) -> EmailMessage:
    msg = EmailMessage()
    from_name = os.getenv("SMTP_FROM_NAME", "Knovi")
    from_addr = os.getenv("SMTP_FROM", "")
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    return msg


def send_email(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Send an email over SMTP. Raises on failure so callers can react."""
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() != "false"

    msg = _build_message(to_email, subject, html_body, text_body)

    if use_tls:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=context)
            if user:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP_SSL(host, port, timeout=20) as server:
            if user:
                server.login(user, password)
            server.send_message(msg)


# ── HTML templates ────────────────────────────────────────────────

# A small educational strip shown at the bottom of every email.
EDU_TIP = (
    "Knovi is a student-first learning community. Learn from classmates who "
    "excel where you struggle, and teach what you know best — because the best "
    "way to master something is to explain it to someone else."
)


# Public logo PNG (hosted on Supabase Storage). Email clients load https://
# images fine, unlike data: URIs (Gmail strips those) or SVG (not supported).
LOGO_URL = (
    "https://iqmwntlyqvyugbilqefb.supabase.co"
    "https://knovi.pages.dev/knovi-logo.svg"
)


def _header() -> str:
    return f"""\
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="{LOGO_URL}" width="36" height="36" alt="Knovi"
                       style="display:block;border:0;border-radius:9px;" />
                </td>
                <td style="vertical-align:middle;font-size:22px;font-weight:800;color:#ffffff;">
                  Peer<span style="color:#60a5fa;">Up</span>
                </td>
              </tr>
            </table>"""


def _footer() -> str:
    return f"""\
            <hr style="border:0;border-top:1px solid #24324f;margin:26px 0 16px;" />
            <p style="font-size:12px;line-height:1.6;color:#64748b;margin:0 0 12px;">{EDU_TIP}</p>
            <p style="font-size:11px;color:#475569;margin:0;">
              © Knovi — Learn. Teach. Grow.<br />
              You're receiving this because an account action was requested with this email address.
            </p>"""


def _shell(title: str, intro: str, button_label: str, link: str, footer: str) -> str:
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#0a1428;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1428;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#0e1b34;border:1px solid #24324f;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#60a5fa,#5b6ef5,#a78bfa);"></td></tr>
          <tr><td style="padding:32px;">
            {_header()}
            <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">{title}</h1>
            <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 24px;">{intro}</p>
            <a href="{link}"
               style="display:inline-block;background:linear-gradient(135deg,#5b6ef5,#6366f1);
                      color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;
                      padding:13px 26px;border-radius:10px;">{button_label}</a>
            <p style="font-size:12px;color:#64748b;margin:24px 0 0;line-height:1.6;">{footer}</p>
            <p style="font-size:11px;color:#475569;margin:16px 0 0;word-break:break-all;">
              If the button doesn't work, paste this link into your browser:<br />{link}
            </p>
            {_footer()}
          </td></tr>
        </table>
        <p style="font-size:11px;color:#475569;margin:16px 0 0;">© Knovi — Learn. Teach. Grow.</p>
      </td></tr>
    </table>
  </body>
</html>"""


def password_reset_email(link: str) -> tuple[str, str, str]:
    subject = "Reset your Knovi password"
    html = _shell(
        title="Reset your password",
        intro="We received a request to reset your Knovi password. Click the button below to choose a new one. This link expires soon.",
        button_label="Reset password",
        link=link,
        footer="If you didn't request this, you can safely ignore this email — your password won't change.",
    )
    text = f"Reset your Knovi password using this link:\n{link}\n\nIf you didn't request this, ignore this email."
    return subject, html, text


def verification_email(link: str) -> tuple[str, str, str]:
    subject = "Verify your Knovi email"
    html = _shell(
        title="Verify your email",
        intro="Welcome to Knovi! Confirm your email address to activate your account and start learning with your peers.",
        button_label="Verify email",
        link=link,
        footer="If you didn't create a Knovi account, you can ignore this email.",
    )
    text = f"Verify your Knovi email using this link:\n{link}"
    return subject, html, text


def _code_shell(code: str, title: str, intro: str) -> str:
    boxes = "".join(
        f'<span style="display:inline-block;min-width:44px;padding:14px 0;margin:0 4px;'
        f'background:#0a1428;border:1px solid #24324f;border-radius:10px;color:#60a5fa;'
        f'font-size:28px;font-weight:800;letter-spacing:2px;">{ch}</span>'
        for ch in code
    )
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#0a1428;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1428;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#0e1b34;border:1px solid #24324f;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#60a5fa,#5b6ef5,#a78bfa);"></td></tr>
          <tr><td style="padding:32px;text-align:center;">
            <div style="text-align:left;">{_header()}</div>
            <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;text-align:left;">{title}</h1>
            <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 24px;text-align:left;">
              {intro}
            </p>
            <div style="margin:8px 0 20px;">{boxes}</div>
            <p style="font-size:13px;color:#64748b;margin:0 0 4px;text-align:left;">
              This code expires in 15 minutes. Never share it with anyone — the Knovi team will never ask for it.
            </p>
            <div style="text-align:left;">{_footer()}</div>
          </td></tr>
        </table>
        <p style="font-size:11px;color:#475569;margin:16px 0 0;">© Knovi — Learn. Teach. Grow.</p>
      </td></tr>
    </table>
  </body>
</html>"""


def verification_code_email(code: str) -> tuple[str, str, str]:
    subject = f"Your Knovi verification code: {code}"
    html = _code_shell(
        code,
        title="Welcome to Knovi — verify your email",
        intro=(
            "You're one step away from joining a community of students who learn together. "
            "Enter this 6-digit code in Knovi to verify your email and activate your account."
        ),
    )
    text = (
        f"Welcome to Knovi!\n\nYour verification code is: {code}\n"
        "It expires in 15 minutes. Enter it in Knovi to activate your account.\n\n"
        "Knovi — Learn. Teach. Grow."
    )
    return subject, html, text


def activity_email(title: str, what: str) -> tuple[str, str, str]:
    """A security/activity notice: 'your X changed — if this wasn't you, …'."""
    subject = f"Knovi security alert: {title}"
    intro = (
        f"This is a confirmation that {what} on your Knovi account. "
        "If you made this change, no action is needed."
    )
    footer = (
        "If this <b>wasn't you</b>, your account may be at risk. Reset your password "
        "immediately from the sign-in page and contact Knovi support."
    )
    html = f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#0a1428;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1428;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#0e1b34;border:1px solid #24324f;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#60a5fa,#5b6ef5,#a78bfa);"></td></tr>
          <tr><td style="padding:32px;">
            {_header()}
            <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">{title}</h1>
            <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 16px;">{intro}</p>
            <div style="background:#3a1a20;border:1px solid #7f1d1d;border-radius:10px;padding:12px 14px;">
              <p style="font-size:13px;line-height:1.6;color:#fca5a5;margin:0;">{footer}</p>
            </div>
            {_footer()}
          </td></tr>
        </table>
        <p style="font-size:11px;color:#475569;margin:16px 0 0;">© Knovi — Learn. Teach. Grow.</p>
      </td></tr>
    </table>
  </body>
</html>"""
    text = (
        f"{title}\n\n{intro}\n\n"
        "If this wasn't you, reset your password immediately and contact Knovi support.\n\n"
        "Knovi — Learn. Teach. Grow."
    )
    return subject, html, text


def account_deleted_email(name: str = "") -> tuple[str, str, str]:
    """Confirmation that the account and all its data were permanently deleted."""
    subject = "Your Knovi account has been deleted"
    hello = f"Hi {name}," if name else "Hi,"
    intro = (
        "This confirms that your Knovi account and all of its data — your profile, "
        "messages, and progress — have been permanently deleted at your request. "
        "This can't be undone."
    )
    footer = (
        "If you <b>didn't</b> request this deletion, someone may have had access to your "
        "account. Please contact Knovi support right away."
    )
    html = f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#0a1428;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1428;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#0e1b34;border:1px solid #24324f;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:linear-gradient(90deg,#60a5fa,#5b6ef5,#a78bfa);"></td></tr>
          <tr><td style="padding:32px;">
            {_header()}
            <h1 style="font-size:20px;color:#ffffff;margin:0 0 12px;">Your account has been deleted</h1>
            <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 6px;">{hello}</p>
            <p style="font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 16px;">{intro}</p>
            <div style="background:#3a1a20;border:1px solid #7f1d1d;border-radius:10px;padding:12px 14px;">
              <p style="font-size:13px;line-height:1.6;color:#fca5a5;margin:0;">{footer}</p>
            </div>
            <p style="font-size:13px;line-height:1.6;color:#94a3b8;margin:16px 0 0;">
              We're sorry to see you go. You're always welcome back — just sign up again anytime.
            </p>
            {_footer()}
          </td></tr>
        </table>
        <p style="font-size:11px;color:#475569;margin:16px 0 0;">© Knovi — Learn. Teach. Grow.</p>
      </td></tr>
    </table>
  </body>
</html>"""
    text = (
        f"{hello}\n\n{intro}\n\n"
        "If you didn't request this, contact Knovi support right away.\n\n"
        "We're sorry to see you go — you're welcome back anytime.\n\n"
        "Knovi — Learn. Teach. Grow."
    )
    return subject, html, text


def reset_code_email(code: str) -> tuple[str, str, str]:
    subject = f"Your Knovi password reset code: {code}"
    html = _code_shell(
        code,
        title="Reset your Knovi password",
        intro=(
            "We received a request to reset your password. Enter this 6-digit code in Knovi "
            "to set a new one. If you didn't request this, you can safely ignore this email."
        ),
    )
    text = (
        f"Your Knovi password reset code is: {code}\n"
        "It expires in 15 minutes. If you didn't request this, ignore this email.\n\n"
        "Knovi — Learn. Teach. Grow."
    )
    return subject, html, text
