import mongoose from "mongoose";

export function buildDocsModels(base: typeof mongoose = mongoose) {
  const { Schema, model } = new base.Mongoose();

  const addressSchema = new Schema(
    {
      city: { type: String, required: true },
      zip: { type: String, match: /^\d{6}$/ },
    },
    { _id: false },
  );

  const userSchema = new Schema({
    name: { type: String, required: true, minLength: 2 },
    email: { type: String, required: true, lowercase: true },
    password: { type: String, required: true, minLength: 8 },
    age: { type: Number, min: 13 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    credits: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    profile: {
      bio: { type: String, maxLength: 160 },
      website: String,
    },
    address: addressSchema,
    tags: [String],
    preferences: Schema.Types.Mixed,
  });

  return { User: model("User", userSchema) };
}
