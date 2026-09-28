/**
 * Email Template for Verification Code
 * @param {string} code - The verification code to display
 * @param {string} validFor - Validity period (e.g., "2 minutes")
 * @returns {string} HTML email template
 */
const getVerificationCodeTemplate = (code, validFor = "2 minutes") => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code - countr</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
            padding: 20px;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .email-body {
            padding: 40px 30px;
            text-align: center;
        }
        .greeting {
            font-size: 18px;
            color: #333333;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .code-container {
            background-color: #e8edf6; /* Outlook fallback: gradients are ignored there */
            background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            border: 2px dashed #667eea;
        }
        .verification-code {
            font-size: 42px;
            font-weight: 700;
            letter-spacing: 8px;
            color: #667eea;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
        }
        .code-label {
            font-size: 14px;
            color: #666666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        .message {
            font-size: 16px;
            color: #555555;
            line-height: 1.6;
            margin: 20px 0;
        }
        .validity-info {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 25px 0;
            border-radius: 4px;
            text-align: left;
        }
        .validity-info p {
            font-size: 14px;
            color: #856404;
            margin: 0;
        }
        .warning {
            background-color: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 25px 0;
            border-radius: 4px;
            text-align: left;
        }
        .warning p {
            font-size: 14px;
            color: #721c24;
            margin: 0;
        }
        .email-footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        .email-footer p {
            font-size: 14px;
            color: #6c757d;
            margin: 5px 0;
        }
        .email-footer a {
            color: #667eea;
            text-decoration: none;
        }
        .divider {
            height: 1px;
            background-color: #e9ecef;
            margin: 30px 0;
        }
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100%;
            }
            .email-body {
                padding: 30px 20px;
            }
            .verification-code {
                font-size: 36px;
                letter-spacing: 6px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-body">
            <p class="greeting">Hello!</p>
            
            <p class="message">
                You've requested a verification code to complete your action. 
                Please use the code below to verify your identity.
            </p>
            
            <div class="code-container">
                <div class="code-label">Your Verification Code</div>
                <div class="verification-code">${code}</div>
            </div>
            
            <div class="validity-info">
                <p><strong>⏱️ Validity:</strong> This code is valid for ${validFor}.</p>
            </div>
            
            <div class="warning">
                <p><strong>⚠️ Security Notice:</strong> Never share this code with anyone. countr staff will never ask for your verification code.</p>
            </div>
            
            <div class="divider"></div>
            
            <p class="message" style="font-size: 14px; color: #999;">
                If you didn't request this code, please ignore this email or contact our support team.
            </p>
        </div>
        
        <div class="email-footer">
            <p><strong>countr</strong></p>
            <p>Thank you for using our service!</p>
        </div>
    </div>
</body>
</html>
  `.trim();
};

module.exports = {
  getVerificationCodeTemplate,
};
