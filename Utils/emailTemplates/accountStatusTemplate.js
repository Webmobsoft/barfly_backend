/**
 * Email Template for Account Status Change (Blocked/Unblocked)
 * @param {string} name - The user's or entity's name
 * @param {string} status - "Blocked" or "Active"
 * @param {string} type - "account" or "entity"
 * @returns {string} HTML email template
 */
const getAccountStatusTemplate = (name, status, type = "account") => {
  const isBlocked = status === "Blocked";
  const statusText = isBlocked ? "blocked" : "unblocked";
  const statusColor = isBlocked ? "#dc3545" : "#28a745";
  const statusIcon = isBlocked ? "🚫" : "✅";
  const statusBg = isBlocked ? "#f8d7da" : "#d4edda";
  const statusBorder = isBlocked ? "#dc3545" : "#28a745";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Account Status Update - countr</title>
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
            font-size: 24px;
            color: #333333;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .message {
            font-size: 16px;
            color: #555555;
            line-height: 1.6;
            margin: 20px 0;
            text-align: left;
        }
        .status-box {
            background-color: ${statusBg};
            border-left: 4px solid ${statusBorder};
            border-radius: 8px;
            padding: 25px;
            margin: 30px 0;
            text-align: center;
        }
        .status-box .status-icon {
            font-size: 40px;
            margin-bottom: 10px;
        }
        .status-box .status-text {
            font-size: 20px;
            font-weight: 700;
            color: ${statusColor};
            text-transform: uppercase;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
            text-align: left;
        }
        .info-box p {
            font-size: 15px;
            color: #333333;
            margin: 5px 0;
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
            .greeting {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-body">
            <p class="greeting">Dear ${name},</p>

            <p class="message">
                We are writing to inform you that the countr Admin has <strong>${statusText}</strong> your ${type}.
            </p>

            <div class="status-box">
                <div class="status-icon">${statusIcon}</div>
                <div class="status-text">Your ${type} has been ${statusText}</div>
            </div>

            ${
              isBlocked
                ? `<div class="info-box">
                <p><strong>What does this mean?</strong></p>
                <p>Your ${type} has been temporarily suspended. You will not be able to access the platform until your ${type} is reactivated by the admin.</p>
                <p>If you believe this is a mistake, please contact our support team.</p>
            </div>`
                : `<div class="info-box">
                <p><strong>Welcome back!</strong></p>
                <p>Your ${type} has been reactivated. You can now log in and continue using the platform as usual.</p>
            </div>`
            }

            <div class="divider"></div>

            <p class="message" style="font-size: 14px; color: #999; text-align: center;">
                If you have any questions or need assistance, please don't hesitate to reach out to our support team.
            </p>
        </div>

        <div class="email-footer">
            <p><strong>countr</strong></p>
            <p>Thank you for being part of our community!</p>
        </div>
    </div>
</body>
</html>
  `.trim();
};

module.exports = {
  getAccountStatusTemplate,
};
