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
  return `VRS Authorization Update: Your submission for SO# ${serviceOrder} has been APPROVED at Stage 1 review. An auth code will be sent shortly.`;
}

export function buildStage1RejectedMessage(serviceOrder: string, reason: string): string {
  return `VRS Authorization Update: Your submission for SO# ${serviceOrder} has been REJECTED. Reason: ${reason}. Please contact your supervisor if you have questions.`;
}

export function buildAuthCodeMessage(serviceOrder: string, authCode: string, rgcCode?: string | null): string {
  if (rgcCode) {
    return `VRS Authorization for SO#${serviceOrder}\nRGC Code: ${rgcCode}\nAuth Code: ${authCode}\nEnter both codes in TechHub to complete the job.`;
  }
  return `VRS Authorization Code: Your auth code for SO# ${serviceOrder} is: ${authCode}. Please use this code to proceed with the repair.`;
}
