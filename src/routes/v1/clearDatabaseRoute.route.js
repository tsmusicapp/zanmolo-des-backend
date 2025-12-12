const express = require("express");
const { Job, LyricsMusic, Music, ShareMusicAsset } = require("../../models");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    await Promise.all([
      Job.deleteMany({}),
      LyricsMusic.deleteMany({}),
      Music.deleteMany({}),
      ShareMusicAsset.deleteMany({}),
    ]);

    res.json({ message: "All related collections cleared from the database." });
  } catch (error) {
    console.error("Error clearing collections:", error);
    res.status(500).json({ message: "Failed to clear collections." });
  }
});

module.exports = router;
