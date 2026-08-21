export const enVerification = {
  verification: {
    badge: "Verified",
    badgeTitle: "Photo-verified member",
    badgeExplainer:
      "A LYVE reviewer compared this member's selfie with their profile photos. Verification applies to every member — women and men alike.",
    cardTitle: "Verify your profile",
    cardSubtitle:
      "Verified profiles are trusted more and get more replies. Verification is optional and open to everyone.",
    status: {
      unverified: "Not verified yet",
      pending: "Under review",
      verified: "Verified",
      rejected: "Not approved",
    },
    pendingBody: "Our team reviews verification selfies manually. This usually takes a short while.",
    verifiedBody: "Your profile carries the Verified badge.",
    rejectedBody:
      "Your last selfie could not be matched with your photos. You can send a clearer one.",
    upload: "Upload a verification selfie",
    uploading: "Uploading…",
    requirementsTitle: "What we need",
    requirements: [
      "A clear selfie of your face, taken now — no filters, no sunglasses.",
      "Good lighting, face fully visible.",
      "At least one profile photo already uploaded.",
    ],
    privacy:
      "The verification selfie is private: it is never shown on your profile, never shared with other members, and only reviewers can open it.",
    noteLabel: "Reviewer note",
    error: "We couldn't submit your verification. Please try again.",
  },
  phoneVerification: {
    title: "Verify your phone number",
    subtitle:
      "A verified phone number ties one account to one real person and makes fake profiles far harder to create.",
    phoneLabel: "Phone number",
    phoneHelp: "Include the country code, for example +971500000000.",
    sendCode: "Send code",
    codeLabel: "Verification code",
    codeHelp: "Enter the 6-digit code we sent to",
    confirm: "Confirm code",
    changeNumber: "Use a different number",
    verified: "Phone verified",
    verifiedBody:
      "This number is now linked to your account and cannot be used to create another one.",
    invalidPhone: "Enter a valid number in international format, starting with +.",
    sendFailed: "We couldn't send the code. Check the number and try again.",
    confirmFailed: "That code didn't work. Request a new one and try again.",
    privacy:
      "Your phone number is never shown on your profile or shared with other members. It is used only for verification and account security.",
  },

  trust: {
    title: "Real people, calmer conversations",
    subtitle:
      "Two things push people away from dating apps: fake profiles and unwanted messages. LYVE is built against both.",
    catfishTitle: "Protection against catfishing",
    catfishItems: [
      "Photo verification: a reviewer compares a live selfie with the profile photos before the Verified badge is granted.",
      "Phone verification by SMS code ties one account to one number.",
      "One account per person, adults only, with date of birth required at signup.",
      "Report any profile in a few taps; high-risk reports go to human review.",
      "Repeated impersonation leads to removal, and every decision is logged.",
    ],
    spamTitle: "Protection against unwanted messages",
    spamItems: [
      "Nobody can message you before you both like each other — no cold inbox.",
      "Automated screening flags harassment, scams and money requests for review.",
      "Block or unmatch instantly; blocked members disappear from discovery both ways.",
      "Contact details, exact location and payment data are never exposed in the product.",
    ],
    note: "No platform can promise perfect safety. These are the controls we actually run, and the Verified badge only appears after a human review.",
  },
  adminVerification: {
    tab: "Verification",
    title: "Verification queue",
    subtitle: "Compare the selfie with the member's profile photos before deciding.",
    empty: "No verification requests in this state.",
    loading: "Loading verification requests…",
    selfie: "Verification selfie",
    profilePhotos: "Profile photos",
    submitted: "Submitted",
    approve: "Approve",
    reject: "Reject",
    notePlaceholder: "Optional note for the member",
    approved: "Member verified.",
    rejected: "Verification rejected.",
    failed: "The decision could not be saved.",
    filter: {
      pending: "Pending",
      verified: "Approved",
      rejected: "Rejected",
    },
  },
};
