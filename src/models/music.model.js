const mongoose = require("mongoose");
const { toJSON, paginate } = require("./plugins");

// Define the music schema with ratings
const musicSchema = mongoose.Schema(
  {
    songName: {
      type: String,
      required: true,
    },
    myRole: [
      {
        type: String,
        required: true,
      },
    ],
    singerName: {
      type: String,
    },
    publisher: {
      type: String,
    },
    albumname: {
      type: String,
    },
    publishTime: {
      type: Date,
      // required: true,
    },
    songLanguage: {
      type: String,
    },
    musicCulturalRegion: {
      type: String,
      // required: true,
    },
    musicUsage: {
      type: String,
    },
    musicStyle: {
      type: String,
      required: true,
    },
    musicInstrument: {
      type: String,
    },
    musicMood: {
      type: String,
    },
    filmGenre: {
      type: String,
    },
    gameGenre: {
      type: String,
    },
    music: {
      type: String,
      // required: true,
    },
    musicImage: {
      type: String,
      required: true,
    },
    musicAudio: {
      type: String,
      required: true,
    },
    musicLyric: {
      type: String,
    },
    musicBackground: {
      type: String,
      // required: true,
    },
    musicInstrumental: {
      type: String,
    },
    tags: [
      {
        type: String,
      },
    ],
    // describe: {
    //   type: String,
    // },
    softwareTool: {
      type: String,
    },
    description: {
      type: String,
    },
    createdBy: {
      type: String,
      required: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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
        profilePicture: {
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
        replies: [
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
    ratings: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    userName: {
      type: String,
      required: true,
    },
    // Array untuk menyimpan multiple contributors dalam 1 musik
    contributors: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        userName: {
          type: String,
          required: true,
        },
        profilePicture: {
          type: String,
        },
        myRole: [
          {
            type: String,
            required: true,
          },
        ],
        description: {
          type: String,
          required: true,
        },
        contributionDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Fields for multi-role contribution tracking (deprecated - akan dihapus)
    isContribution: {
      type: Boolean,
      default: false,
    },
    originalMusicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Music",
    },
    contributionDate: {
      type: Date,
    },
    views: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Add plugins that convert mongoose to JSON and enable pagination
musicSchema.plugin(toJSON);
musicSchema.plugin(paginate);

// Method to calculate average rating
musicSchema.methods.calculateAverageRating = function () {
  if (this.ratings.length === 0) return 0;
  const totalRating = this.ratings.reduce(
    (sum, rating) => sum + rating.rating,
    0,
  );
  return totalRating / this.ratings.length;
};

/**
 * @typedef Music
 */
const Music = mongoose.model("Music", musicSchema);

module.exports = Music;
