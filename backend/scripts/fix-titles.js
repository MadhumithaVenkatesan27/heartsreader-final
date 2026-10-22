const mongoose = require("mongoose");
const config = require("../src/config");
const Book = require("../src/models/Book");

(async () => {
  await mongoose.connect(config.mongoUri);
  const jobs = [
    [
      { slug: "afternoon" },
      { $addToSet: { aliases: { $each: ["afternoontea", "afternoon-v1"] } } },
    ],
    [{ slug: "timeisa" }, { $addToSet: { aliases: "timeisa-v1" } }],
    [
      { slug: "borrowing" },
      {
        $set: { title: "Borrowing Your Textbook" },
        $addToSet: { aliases: "borrowing-v1" },
      },
    ],
  ];
  for (const [filter, update] of jobs) {
    const r = await Book.updateOne(filter, update);
    console.log(
      JSON.stringify(filter),
      "matched:",
      r.matchedCount,
      "modified:",
      r.modifiedCount,
    );
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
