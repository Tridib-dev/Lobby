import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

await mongoose.connect(uri, { bufferCommands: false });
try {
  const db = mongoose.connection.db;
  const events = db.collection("events");
  const registrations = db.collection("eventregistrations");

  const invalidCounters = await events.aggregate([
    { $match: { capacity: { $type: "number" } } },
    {
      $project: {
        title: 1,
        capacity: 1,
        confirmed: { $ifNull: ["$confirmedRegistrationCount", 0] },
        reserved: { $ifNull: ["$reservedRegistrationCount", 0] },
      },
    },
    { $match: { $expr: { $or: [
      { $lt: ["$confirmed", 0] },
      { $lt: ["$reserved", 0] },
      { $gt: [{ $add: ["$confirmed", "$reserved"] }, "$capacity"] },
    ] } } },
  ]).toArray();

  const duplicateRegistrations = await registrations.aggregate([
    { $match: { state: { $in: ["free_confirmed", "payment_hold", "paid_confirmed"] } } },
    { $group: { _id: { eventId: "$eventId", clerkId: "$clerkId" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (invalidCounters.length || duplicateRegistrations.length) {
    console.error(JSON.stringify({ invalidCounters, duplicateRegistrations }, null, 2));
    process.exitCode = 2;
  } else {
    console.log("Capacity inventory audit passed: no over-capacity counters or duplicate active registrations found.");
  }
} finally {
  await mongoose.disconnect();
}
