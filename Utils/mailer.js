const nodemailer = require("nodemailer");
const twilio = require("twilio");
const juice = require("juice");

// Alternative OAuth2 configuration (more secure)
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     type: 'OAuth2',
//     user: process.env.MAIL_USER,
//     clientId: process.env.GMAIL_CLIENT_ID,
//     clientSecret: process.env.GMAIL_CLIENT_SECRET,
//     refreshToken: process.env.GMAIL_REFRESH_TOKEN,
//     accessToken: process.env.GMAIL_ACCESS_TOKEN,
//   },
// });

// Simple Gmail configuration with app-specific password
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});
module.exports.createMail = async (mail_data) => {
  try {
    const mailOptions = {
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: mail_data.to,
      subject: mail_data.subject,
    };

    // Add text or html content. Inline the CSS so the email renders the same in
    // clients that strip <head><style> (Outlook) or drop <head> on forwarding.
    // Guarded so a malformed template can never block sending — falls back to raw.
    if (mail_data.html) {
      try {
        mailOptions.html = juice(mail_data.html);
      } catch (inlineErr) {
        console.error("⚠️ CSS inline (juice) failed, sending raw HTML:", inlineErr.message);
        mailOptions.html = mail_data.html;
      }
    }
    if (mail_data.text) {
      mailOptions.text = mail_data.text;
    }

    if (mail_data.cc) {
      mailOptions.cc = mail_data.cc;
    }

    // Add BCC if needed
    if (mail_data.bcc) {
      mailOptions.bcc = mail_data.bcc;
    }

    // Add attachments if provided
    if (mail_data.attachments && Array.isArray(mail_data.attachments)) {
      mailOptions.attachments = mail_data.attachments;
    }

    console.log("🔄 Attempting to verify SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully");

    console.log("📧 Sending email...");
    const result = await transporter.sendMail(mailOptions);
    console.info(`✅ Email sent successfully to: ${mail_data.to}`);
    console.log("📧 Message ID:", result.messageId);

    if (mail_data.cc) {
      console.info(`📧 CC sent to: ${mail_data.cc}`);
    }

    transporter.close();
    return true;
  } catch (error) {
    console.error("❌ ERROR!!! While sending email", error.message);
    console.error("📋 Full error details:", {
      code: error.code,
      response: error.response,
      responseCode: error.responseCode,
      command: error.command,
    });

    // Provide helpful error messages
    if (error.code === "EAUTH") {
      console.error("🔐 Authentication failed. Please check:");
      console.error("   1. Enable 2FA on your Gmail account");
      console.error("   2. Generate an app-specific password");
      console.error(
        "   3. Use the app-specific password in MAIL_PASS environment variable"
      );
      console.error("   4. Make sure MAIL_USER is set to your Gmail address");
    }

    return false;
  }
};

const accountSid = process.env.TWILIO_ACC_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = new twilio(accountSid, authToken);

module.exports.sendSMS = async ({ toPhoneNumber, message }) => {
  client.messages
    .create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
    })
    .then((message) => {
      console.log("Message sent successfully: " + message.sid);
    })
    .catch((error) => {
      console.error("Error sending SMS: " + error.message);
    });
};
