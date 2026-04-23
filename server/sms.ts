import twilio from "twilio";
import { storage } from "./storage";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+")) return phone;
  return `+${digits}`;
}

function getTwilioConfig() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const rawPhone = process.env.TWILIO_PHONE_NUMBER;
  const phone = rawPhone ? normalizePhone(rawPhone) : undefined;
  return { sid, token, phone };
}

function getTwilioClient(): { client: ReturnType<typeof twilio>; phone: string } | null {
  const { sid, token, phone } = getTwilioConfig();
  if (!sid || !token || !phone) {
    console.warn(`[SMS] Twilio not configured — missing: ${[
      !sid && "TWILIO_ACCOUNT_SID",
      !token && "TWILIO_AUTH_TOKEN",
      !phone && "TWILIO_PHONE_NUMBER",
    ].filter(Boolean).join(", ")}`);
    return null;
  }
  return { client: twilio(sid, token), phone };
}

export async function sendSmsMessage(
  recipientPhone: string,
  messageBody: string
): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
  const twilioConfig = getTwilioClient();
  const normalizedPhone = normalizePhone(recipientPhone);

  if (twilioConfig) {
    try {
      const message = await twilioConfig.client.messages.create({
        body: messageBody,
        from: twilioConfig.phone,
        to: normalizedPhone,
      });
      console.log(`[SMS] Sent to ${normalizedPhone} (from: ${recipientPhone}), SID: ${message.sid}`);
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

  const normalizedPhone = normalizePhone(recipientPhone);
  const twilioConfig = getTwilioClient();

  let twilioSid: string | null = null;

  if (twilioConfig) {
    try {
      const message = await twilioConfig.client.messages.create({
        body: messageBody,
        from: twilioConfig.phone,
        to: normalizedPhone,
      });
      twilioSid = message.sid;
      console.log(`[SMS] Sent ${messageType} to ${normalizedPhone} (input: ${recipientPhone}) for submission ${submissionId}, SID: ${message.sid}`);
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

export function buildRejectAndCloseMessage(serviceOrder: string, reason: string, warrantyType?: string): string {
  const wt = (warrantyType || "").toLowerCase();
  const isExternalWarranty = wt === "american_home_shield" || wt === "first_american";
  const isInfestation = /infestation/i.test(reason);
  const suppressCashCall = isExternalWarranty || isInfestation;
  const closing = suppressCashCall
    ? "This repair is not covered under warranty. No further VRS submissions can be made for this service order."
    : "This repair is not covered under warranty. You may offer the customer a cash call estimate for the repair. No further VRS submissions can be made for this service order.";
  return `VRS Update for SO#${serviceOrder}\n\nStatus: REJECTED — NOT COVERED\nReason: ${reason}\n\n${closing}`;
}

export function buildNlaApprovalMessage(serviceOrder: string, rgcCode?: string | null, agentMessage?: string): string {
  let msg = `VRS Authorization for SO#${serviceOrder}`;
  if (rgcCode) {
    msg += `\nYour RGC/Auth Code: ${rgcCode}\nEnter this code in TechHub to complete the job.`;
  }
  msg += `\n\nYour Parts NLA request has been received by the VRS Parts team. You will be contacted with further information regarding part sourcing and availability.`;
  if (agentMessage) {
    msg += `\n\n${agentMessage}`;
  }
  return msg;
}

export function buildAuthCodeMessage(serviceOrder: string, authCode: string, rgcCode?: string | null, agentMessage?: string): string {
  let msg: string;
  const hasAuth = !!(authCode && authCode.trim());
  const hasRgc = !!(rgcCode && rgcCode.trim());
  if (hasAuth && hasRgc) {
    msg = `VRS Authorization for SO#${serviceOrder}\nAuthorization Code: ${authCode}\nRGC Code: ${rgcCode}\nEnter both codes in TechHub to complete the job.`;
  } else if (hasRgc) {
    msg = `VRS Authorization for SO#${serviceOrder}\nYour RGC/Auth Code: ${rgcCode}\nEnter this code in TechHub to complete the job.`;
  } else {
    msg = `VRS Authorization Code: Your auth code for SO# ${serviceOrder} is: ${authCode}. Please use this code to proceed with the repair.`;
  }
  if (agentMessage) {
    msg += `\n\n${agentMessage}`;
  }
  return msg;
}

export function buildSubmissionReceivedMessage(
  serviceOrder: string,
  warrantyType?: string,
  requestType?: string
): string {
  const wt = (warrantyType || "").toLowerCase();
  const isExternal = wt === "american_home_shield" || wt === "first_american";
  const isNla = requestType === "parts_nla";

  let waitCopy: string;
  if (isNla) {
    waitCopy =
      "NLA requests are researched by the VRS parts team. You will be contacted with sourcing details — typical turnaround is 1–2 business days.";
  } else if (isExternal) {
    waitCopy =
      "This is a Sears Protect external-warranty request (AHS / First American). Approvals require a provider callback and can take longer than standard Sears Protect tickets. Please remain at the site until you receive the approval/rejection text.";
  } else {
    waitCopy =
      "A VRS agent will review your request shortly. Standard turnaround is a few minutes during business hours. Please remain at the site until you receive the approval/rejection text.";
  }

  return `VRS Submission received for SO#${serviceOrder}\n\n${waitCopy}\n\nYou will receive a follow-up text when the decision is made.`;
}
