import mongoose9 from "mongoose";
import mongoose8 from "mongoose-v8";

type MongooseModule = typeof mongoose9;

export const versions = [
  { label: "mongoose 8", mongoose: mongoose8 },
  { label: "mongoose 9", mongoose: mongoose9 },
];

export function buildModels(base: MongooseModule) {
  const { Schema, model } = new base.Mongoose();

  const address = new Schema(
    {
      city: { type: String, required: true },
      zip: { type: String, match: /^\d{6}$/ },
    },
    { _id: false },
  );

  const user = new Schema({
    name: { type: String, required: true, minLength: 2 },
    email: { type: String, lowercase: true },
    age: { type: Number, min: 13 },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isVerified: { type: Boolean, default: false },
    profile: {
      bio: { type: String, maxLength: 20 },
      links: { site: String, github: String },
    },
    address,
    addresses: [address],
    tags: {
      type: [String],
      validate: { validator: (tags: string[]) => tags.length <= 3, message: "Too many tags" },
    },
    scores: { type: Map, of: { type: Number, min: 0 } },
    contacts: { type: Map, of: address },
    settings: Schema.Types.Mixed,
    birthday: Date,
    managerId: Schema.Types.ObjectId,
    balance: Schema.Types.Decimal128,
    externalId: Schema.Types.UUID,
    views: BigInt,
    avatar: Buffer,
    rating: Schema.Types.Double,
    level: Schema.Types.Int32,
    matrix: [[Number]],
    username: {
      type: String,
      validate: {
        validator: async (value: string) => value !== "taken",
        message: "Username is taken",
      },
    },
    createdBy: { type: String, required: true },
  });

  const stop = new Schema(
    {
      city: { type: String, required: true },
      trackingCode: { type: String, required: true },
    },
    { _id: false },
  );

  const order = new Schema({
    note: String,
    stops: [stop],
    shipping: new Schema(
      {
        city: { type: String, required: true },
        trackingCode: { type: String, required: true },
      },
      { _id: false },
    ),
  });

  const flaky = new Schema({ name: String });
  flaky.pre("validate", async () => {
    throw new Error("database unavailable");
  });

  return {
    User: model("User", user),
    Order: model("Order", order),
    Flaky: model("Flaky", flaky),
  };
}
