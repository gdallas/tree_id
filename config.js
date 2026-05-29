// ============================================================
//  Sprout configuration (AWS edition)
//  Fill these in from your AWS setup, then re-upload to S3
//  and invalidate the CloudFront cache. See README.md.
//  None of these are secret — they're safe in client code.
// ============================================================
window.SPROUT_CONFIG = {
  // Cognito app client ID (User Pool -> App clients)
  CLIENT_ID: "xxxxxxxxxxxxxxxxxxxxxxxxxx",

  // Cognito managed-login domain, WITHOUT https://
  // e.g. "sprout-yourname.auth.us-west-2.amazoncognito.com"
  COGNITO_DOMAIN: "sprout-xxxx.auth.us-west-2.amazoncognito.com",

  // API Gateway HTTP API invoke URL (no trailing slash), e.g.
  // "https://abcd1234.execute-api.us-west-2.amazonaws.com"
  API_BASE: "https://xxxx.execute-api.us-west-2.amazonaws.com",

  // Your live site URL (the CloudFront URL), WITH trailing slash.
  // Must EXACTLY match the Cognito callback + sign-out URLs.
  REDIRECT_URI: "https://xxxx.cloudfront.net/"
};
