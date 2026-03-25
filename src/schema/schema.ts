import * as mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    content: {type: Object, required: true}
  },
);

export type Request = mongoose.InferSchemaType<typeof requestSchema>;

export const Request = mongoose.model("Requests", requestSchema);
