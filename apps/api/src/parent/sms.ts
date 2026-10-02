import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

export const SMS_SENDER = Symbol("SMS_SENDER");

/** Anything that can text a phone. A real provider (a Pakistani SMS gateway, Twilio, ...) implements this and replaces the console sender. */
export interface SmsSender {
  send(toPhoneNorm: string, message: string): Promise<void>;
}

/** Development only: prints the message in the API log. Refuses in production so a code is never silently lost. */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger("Sms");

  async send(toPhoneNorm: string, message: string) {
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Sign-in codes can't be sent right now. Please try again later or contact your school.");
    }
    this.logger.log(`SMS to +${toPhoneNorm}: ${message}`);
  }
}
