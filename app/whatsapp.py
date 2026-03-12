"""WhatsApp messaging via Twilio (optional integration)."""

import os

TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")  # e.g. whatsapp:+14155238886


def send_whatsapp(to_phone: str, message: str) -> bool:
    """Send a WhatsApp message via Twilio. Returns True if sent."""
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_WHATSAPP_FROM]):
        raise RuntimeError("Twilio WhatsApp not configured")

    from twilio.rest import Client
    client = Client(TWILIO_SID, TWILIO_TOKEN)
    # Ensure phone has whatsapp: prefix
    if not to_phone.startswith("whatsapp:"):
        to_phone = f"whatsapp:{to_phone}"
    client.messages.create(
        body=message,
        from_=TWILIO_WHATSAPP_FROM,
        to=to_phone,
    )
    return True
