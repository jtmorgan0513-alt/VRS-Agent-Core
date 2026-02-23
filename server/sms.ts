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
    } catch (err: any) {
      console.error("Twilio SMS error:", err.message);
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

export function buildStage1ApprovedMessage(serviceOrder: string): string {
  return `Your VRS submission has been approved for SO# ${serviceOrder} (Stage 1). Your authorization code will follow shortly. You may same-day reschedule and proceed to your next call while you wait. You'll receive an additional text and the code will also be available in the app once authorized.`;
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

export function buildStage2DeclinedMessage(serviceOrder: string, declineReason: string, instructions?: string): string {
  let msg = `VRS Update for SO#${serviceOrder}\n\nStatus: REPAIR DECLINED\nReason: ${declineReason}`;
  if (instructions) {
    msg += `\n\nInstructions: ${instructions}`;
  }
  msg += `\n\nPlease follow the instructions above and close the order accordingly.`;
  return msg;
}

export function buildAuthCodeMessage(serviceOrder: string, authCode: string, rgcCode?: string | null): string {
  if (rgcCode) {
    return `VRS Authorization for SO#${serviceOrder}\nYour RGC/Auth Code: ${rgcCode}\nEnter this code in TechHub to complete the job.`;
  }
  return `VRS Authorization Code: Your auth code for SO# ${serviceOrder} is: ${authCode}. Please use this code to proceed with the repair.`;
}
