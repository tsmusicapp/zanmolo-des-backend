const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

const lyricsUploadSchema = new mongoose.Schema({
  lyricName: {
    type: String,
    required: true,
  },
  lyricLanguage: {
    type: String,
  },
  lyricStyle: {
    type: String,
  },
  lyricMood: {
    type: String,
  },
  writeLyric: {
    type: String,
    required: true,
  },
  musicImage: {
    type: String,
  },
  tags: [
    {
      type: String,
    },
  ],
  description: {
    type: String,
  },
  createdBy: {
    type: String,
  },
  userName: {
    type: String,
  },
  tools: [
    {
      type: String,
    },
  ],
  comments: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      comment: {
        type: String,
        required: true,
      },
      userName: {
        type: String,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      likes: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      reply: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          reply: {
            type: String,
            required: true,
          },
          userName: {
            type: String,
            required: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
  ],
  likes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

lyricsUploadSchema.plugin(toJSON);
lyricsUploadSchema.plugin(paginate);

const LyricsMusic = mongoose.model("LyricsMusic", lyricsUploadSchema);
module.exports = LyricsMusic;
