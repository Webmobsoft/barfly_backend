const resetPasswordTemplate = (fullName, resetLink) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
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
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .reset-button {
            display: inline-block;
            padding: 15px 40px;
            background-color: #667eea; /* Outlook fallback: gradients are ignored there */
            background-image: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            text-decoration: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            transition: transform 0.2s;
        }
        .reset-button:hover {
            transform: translateY(-2px);
        }
        .link-section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .link-section p {
            font-size: 13px;
            color: #666666;
            margin-bottom: 10px;
        }
        .link-url {
            word-break: break-all;
            color: #667eea;
            font-size: 13px;
        }
        .warning {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .warning p {
            font-size: 14px;
            color: #856404;
            margin: 0;
        }
        .expiry-notice {
            font-size: 13px;
            color: #dc3545;
            text-align: center;
            margin: 20px 0;
            font-weight: 600;
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
            <h1>Password Reset Request</h1>
            <p>Secure your account with a new password</p>
        </div>

        <div class="content">
            <div class="greeting">Hello ${fullName},</div>

            <div class="message">
                We received a request to reset your password for your <strong>countr</strong> admin account.
                Click the button below to create a new password:
            </div>

            <div class="button-container">
                <a href="${resetLink}" class="reset-button">Reset Password</a>
            </div>

            <div class="expiry-notice">
                ⏰ This link will expire in 20 minutes
            </div>

            <div class="link-section">
                <p>If the button above doesn't work, copy and paste this link into your browser:</p>
                <div class="link-url">${resetLink}</div>
            </div>

            <div class="warning">
                <p><strong>⚠️ Important:</strong> If you did not request this password reset, please ignore this email.
                Your password will remain unchanged.</p>
            </div>

            <div class="divider"></div>

            <div class="message" style="margin-bottom: 0;">
                If you have any questions or need assistance, please don't hesitate to contact our support team.
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

module.exports = resetPasswordTemplate;
