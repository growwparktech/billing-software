import mongoose from "mongoose";

export async function connectDB(uri) {
try {
mongoose.set("strictQuery", true);
await mongoose.connect(uri);
console.log("[MongoDB] Connected");
} catch (err) {
console.error("[MongoDB] Connection error:", err.message);
process.exit(1);
}
}