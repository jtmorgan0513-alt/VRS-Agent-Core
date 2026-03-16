import twilio from "twilio";
import { storage } from "./storage";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

function getTwilioClient() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return null;
  }
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

export async function sendSmsMessage(
  recipientPhone: string,
  messageBody: string
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  const client = getTwilioClient();

  if (client && TWILIO_PHONE_NUMBER) {
    try {
      const message = await client.messages.create({
        body: messageBody,
        from: TWILIO_PHONE_NUMBER,
        to: recipientPhone,
      });
      console.log(`[SMS] Sent to ${recipientPhone}, SID: ${message.sid}`);
      return { success: true, twilioSid: message.sid };
    } catch (err: any) {
      console.error("Twilio SMS error:", err.message);
      return { success: false, error: err.message };
    }
  } else {
    console.log(`[SMS MOCK] To: ${recipientPhone} | Body: ${messageBody}`);
    return { success: true, twilioSid: `MOCK_${Date.now()}` };
  }
}

export async function sendSms(
  submissionId: number,
  recipientPhone: string,
  messageType: string,
  messageBody: string
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  if (!recipientPhone) {
    console.error(`[SMS] No phone number for submission ${submissionId}, type: ${messageType}`);
    return { success: false, error: "No recipient phone number" };
  }

  const client = getTwilioClient();

  let twilioSid: string | null = null;

  if (client && TWILIO_PHONE_NUMBER) {
    try {
      const message = await client.messages.create({
        body: messageBody,
        from: TWILIO_PHONE_NUMBER,
        to: recipientPhone,
      });
      twilioSid = message.sid;
      console.log(`[SMS] Sent ${messageType} to ${recipientPhone} for submission ${submissionId}, SID: ${message.sid}`);
    } catch (err: any) {
      console.error(`[SMS] Failed to send ${messageType} to ${recipientPhone} for submission ${submissionId}:`, err.message);
      await storage.createSmsNotification({
        submissionId,
        recipientPhone,
        messageType,
        messageBody,
        twilioSid: `ERROR: ${err.message}`,
      });
      return { success: false, error: err.message };
    }
  } else {
    console.log(`[SMS MOCK] To: ${recipientPhone} | Type: ${messageType} | Body: ${messageBody}`);
    twilioSid = `MOCK_${Date.now()}`;
  }

  await storage.createSmsNotification({
    submissionId,
    recipientPhone,
    messageType,
    messageBody,
    twilioSid,
  });

  return { success: true, twilioSid: twilioSid || undefined };
}

export function buildStage1RejectedMessage(serviceOrder: string, reason: string, resubmitLink?: string): string {
  let msg = `VRS Update for SO#${serviceOrder}\n\nStatus: MORE INFO NEEDED\nReason: ${reason}`;
  if (resubmitLink) {
    msg += `\n\nTap to resubmit with your info saved:\n${resubmitLink}`;
  } else {
    msg += `\n\nPlease contact your supervisor if you have questions.`;
  }
  return msg;
}

export function buildStage1InvalidMessage(serviceOrder: string, invalidReason: string, instructions?: string): string {
  let msg = `VRS Update for SO#${serviceOrder}\n\nStatus: NOT APPLICABLE\nReason: ${invalidReason}`;
  if (instructions) {
    msg += `\n\nInstructions: ${instructions}`;
  }
  msg += `\n\nThis request cannot be processed through VRS. Please follow the instructions above.`;
  return msg;
}

export function buildRejectAndCloseMessage(serviceOrder: string, reason: string): string {
  return `VRS Update for SO#${serviceOrder}\n\nStatus: REJECTED — NOT COVERED\nReason: ${reason}\n\nThis repair is not covered under warranty. You may offer the customer a cash call estimate for the repair. No further VRS submissions can be made for this service order.`;
}

export function buildAuthCodeMessage(serviceOrder: string, authCode: string, rgcCode?: string | null): string {
  if (rgcCode) {
    return `VRS Authorization for SO#${serviceOrder}\nYour RGC/Auth Code: ${rgcCode}\nEnter this code in TechHub to complete the job.`;
  }
  return `VRS Authorization Code: Your auth code for SO# ${serviceOrder} is: ${authCode}. Please use this code to proceed with the repair.`;
}
