const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'licensor', 'admin'], default: 'user' },
    // Licensor portal login (role === 'licensor')
    licensorId: { type: String, lowercase: true, trim: true, unique: true, sparse: true },

    isEmailVerified: { type: Boolean, default: false },
    emailOtpHash: { type: String, select: false },
    emailOtpExpires: { type: Date, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    emailOtpSentAt: { type: Date, select: false },

    passwordResetHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    refreshTokens: { type: [{ hash: String, expires: Date }], select: false, default: [] },

    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    phone: { type: String, trim: true, maxlength: 25, default: '' },
    phoneVerified: { type: Boolean, default: false },
    // Phone change in progress: the new number must confirm a 6-digit SMS code first
    pendingPhone: { type: String, trim: true, select: false },
    pendingPhoneOtpHash: { type: String, select: false },
    pendingPhoneExpires: { type: Date, select: false },
    pendingPhoneAttempts: { type: Number, default: 0, select: false },
    pendingPhoneSentAt: { type: Date, select: false },
    // Wishlist uses the frontend's title ids (e.g. "matchmaker-v1"), so it also works for titles not in the books collection
    wishlist: { type: [{ _id: false, titleId: { type: String, lowercase: true, trim: true }, addedAt: { type: Date, default: Date.now } }], default: [] },
    // Email change in progress (account settings): the new address must confirm a 6-digit code first
    pendingEmail: { type: String, lowercase: true, trim: true, select: false },
    pendingEmailOtpHash: { type: String, select: false },
    pendingEmailExpires: { type: Date, select: false },
    pendingEmailAttempts: { type: Number, default: 0, select: false },
    pendingEmailSentAt: { type: Date, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    phoneVerified: !!this.phoneVerified,
    role: this.role,
    isEmailVerified: this.isEmailVerified,
    ...(this.role === 'licensor' ? { licensorId: this.licensorId } : {}),
  };
};

module.exports = mongoose.model('User', userSchema);
