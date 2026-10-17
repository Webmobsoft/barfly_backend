const otpVerificationTemplate = (otp, purpose = "Email Update") => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OTP Verification</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f4f4;
            padding: 20px;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        .header {
            background-color: #667eea; /* Outlook fallback: gradients are ignored there */
            background-image: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            font-size: 28px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .header p {
            color: #ffffff;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
            color: #333333;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 20px;
            color: #333333;
        }
        .message {
            font-size: 15px;
            line-height: 1.6;
            color: #555555;
            margin-bottom: 30px;
        }
        .otp-container {
            background-color: #f1f3f5; /* Outlook fallback: gradients are ignored there */
            background-image: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 2px dashed #667eea;
            border-radius: 10px;
            padding: 30px;
            margin: 30px 0;
            text-align: center;
        }
        .otp-label {
            font-size: 14px;
            color: #666666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        .otp-code {
            font-size: 42px;
            font-weight: 700;
            color: #667eea;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
        }
        .otp-info {
            font-size: 13px;
            color: #999999;
            margin-top: 15px;
        }
        .expiry-notice {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .expiry-notice p {
            font-size: 14px;
            color: #856404;
            margin: 0;
        }
        .expiry-notice .timer {
            font-weight: 700;
            color: #dc3545;
        }
        .security-notice {
            background-color: #d1ecf1;
            border-left: 4px solid #0c5460;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .security-notice p {
            font-size: 14px;
            color: #0c5460;
            margin: 5px 0;
        }
        .security-notice strong {
            display: block;
            margin-bottom: 8px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        .footer p {
            font-size: 14px;
            color: #666666;
            margin-bottom: 10px;
        }
        .footer .brand {
            font-weight: 600;
            color: #667eea;
            font-size: 16px;
            margin-top: 10px;
        }
        .divider {
            height: 1px;
            background-color: #e9ecef;
            margin: 30px 0;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>Verification Code</h1>
            <p>Secure your ${purpose}</p>
        </div>

        <div class="content">
            <div class="greeting">Hello,</div>

            <div class="message">
                We received a request to verify your identity for <strong>${purpose}</strong> on your <strong>countr</strong> account.
                Please use the One-Time Password (OTP) below to complete the verification:
            </div>

            <div class="otp-container">
                <div class="otp-label">Your Verification Code</div>
                <div class="otp-code">${otp}</div>
                <div class="otp-info">Enter this code to verify your identity</div>
            </div>

            <div class="expiry-notice">
                <p>⏰ <strong>Important:</strong> This OTP is valid for <span class="timer">5 minutes only</span>.
                Please complete your verification before it expires.</p>
            </div>

            <div class="security-notice">
                <p><strong>🛡️ Security Tips:</strong></p>
                <p>• Never share this OTP with anyone, including countr staff</p>
                <p>• countr will never call or text you asking for this code</p>
                <p>• If you didn't request this code, please ignore this email</p>
            </div>

            <div class="divider"></div>

            <div class="message" style="margin-bottom: 0; text-align: center; font-size: 14px;">
                If you're having trouble, please contact our support team for assistance.
            </div>
        </div>

        <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <div class="brand">The countr Team</div>
            <p style="margin-top: 15px; font-size: 12px; color: #999999;">
                © ${new Date().getFullYear()} countr. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
  `.trim();
};

module.exports = otpVerificationTemplate;
