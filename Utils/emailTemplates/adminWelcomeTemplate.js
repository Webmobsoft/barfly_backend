const { t } = require("../translator");

/**
 * Email Template for Admin Welcome Email
 * @param {string} firstName - The admin's first name
 * @param {string} lang - Language code ("en" or "de"). Defaults to "en".
 * @returns {string} HTML email template
 */
const getAdminWelcomeTemplate = (firstName, lang = "en") => {
  return `
<!DOCTYPE html>
<html lang="${lang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t("EMAIL_WELCOME_ADMIN_TITLE", lang)}</title>
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
        .welcome-message {
            font-size: 18px;
            color: #667eea;
            margin-bottom: 30px;
            font-weight: 600;
        }
        .message {
            font-size: 16px;
            color: #555555;
            line-height: 1.6;
            margin: 20px 0;
            text-align: left;
        }
        .highlight-box {
            background-color: #e8edf6; /* Outlook fallback: gradients are ignored there */
            background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            border-radius: 12px;
            padding: 30px;
            margin: 30px 0;
            border: 2px solid #667eea;
        }
        .highlight-box p {
            font-size: 16px;
            color: #333333;
            margin: 10px 0;
            font-weight: 500;
        }
        .features-list {
            text-align: left;
            margin: 25px 0;
            padding-left: 20px;
        }
        .features-list li {
            font-size: 15px;
            color: #555555;
            line-height: 1.8;
            margin: 10px 0;
        }
        .cta-section {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
            text-align: left;
        }
        .cta-section p {
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
            .welcome-message {
                font-size: 16px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-body">
            <p class="greeting">${t("EMAIL_WELCOME_ADMIN_GREETING", lang)}${firstName ? ` ${firstName}` : ""}!</p>

            <div class="welcome-message">
                ${t("EMAIL_WELCOME_ADMIN_HEADLINE", lang)} 🎉
            </div>

            <p class="message">
                ${t("EMAIL_WELCOME_ADMIN_INTRO", lang)}
            </p>

            <div class="highlight-box">
                <p>🔐 ${t("EMAIL_WELCOME_ADMIN_HIGHLIGHT_LINE1", lang)}</p>
                <p>${t("EMAIL_WELCOME_ADMIN_HIGHLIGHT_LINE2", lang)}</p>
            </div>

            <p class="message">
                ${t("EMAIL_WELCOME_ADMIN_FEATURES_HEADING", lang)}
            </p>

            <ul class="features-list">
                <li>👥 ${t("EMAIL_WELCOME_ADMIN_FEATURE_1", lang)}</li>
                <li>📊 ${t("EMAIL_WELCOME_ADMIN_FEATURE_2", lang)}</li>
                <li>💰 ${t("EMAIL_WELCOME_ADMIN_FEATURE_3", lang)}</li>
                <li>🔧 ${t("EMAIL_WELCOME_ADMIN_FEATURE_4", lang)}</li>
            </ul>

            <div class="cta-section">
                <p><strong>🚀 ${t("EMAIL_WELCOME_ADMIN_CTA_TITLE", lang)}</strong></p>
                <p>${t("EMAIL_WELCOME_ADMIN_CTA_BODY", lang)}</p>
            </div>

            <div class="divider"></div>

            <p class="message" style="font-size: 14px; color: #999; text-align: center;">
                ${t("EMAIL_WELCOME_ADMIN_SUPPORT", lang)}
            </p>
        </div>

        <div class="email-footer">
            <p><strong>${t("EMAIL_FOOTER_KLG", lang)}</strong></p>
            <p><strong>${t("EMAIL_FOOTER_SEAT", lang)}</strong></p>
            <p><strong>${t("EMAIL_FOOTER_UID", lang)}</strong></p>
            <p>${t("EMAIL_WELCOME_ADMIN_FOOTER_CLOSING", lang)}</p>
        </div>
    </div>
</body>
</html>
  `.trim();
};

module.exports = {
  getAdminWelcomeTemplate,
};
