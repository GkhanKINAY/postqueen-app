import nodemailer from 'nodemailer';
import {
  EmailExtras,
  EmailInterface,
} from '@gitroom/nestjs-libraries/emails/email.interface';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: +process.env.EMAIL_PORT!,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export class NodeMailerProvider implements EmailInterface {
  name = 'nodemailer';
  validateEnvKeys = [
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_SECURE',
    'EMAIL_USER',
    'EMAIL_PASS',
  ];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string,
    extras?: EmailExtras,
  ) {
    // `text` used to be the HTML itself, so a client showing the plain part
    // showed raw markup, and spam filters saw the two parts disagree.
    const sends = await transporter.sendMail({
      from: `${emailFromName} <${emailFromAddress}>`, // sender address
      to: to, // list of receivers
      subject: subject, // Subject line
      ...(extras?.text && { text: extras.text }), // plain text body
      html: html, // html body
      ...(replyTo && { replyTo }),
    });

    return sends;
  }
}
