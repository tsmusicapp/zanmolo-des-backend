const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const musicCreationSchema = new mongoose.Schema(
  {
    // Work type: 'music' or 'design'
    workType: {
      type: String,
      enum: ['music', 'design'],
      default: 'music',
    },
    
    // Common fields for both music and design
    title: {
      type: String,
      required: [true, 'Title is required.'],
    },
    description: {
      type: String,
      required: [true, 'Description is required.'],
    },
    tags: {
      type: [String],
      default: [],
    },
    softwareTool: {
      type: [String],
      default: [],
    },
    workImages: {
      type: [String],
      default: [],
    },
    embeds: {
      type: String,
      default: '',
    },
    
    // Design-specific fields
    category: {
      type: String,
      default: '',
    },
    subcategory: {
      type: String,
      default: '',
    },
    
    // Music-specific fields (kept for backward compatibility)
    musicName: {
      type: String,
      default: undefined,
    },
    myRole: {
      type: [String],
      enum: ['composer', 'lyricist', 'arranger', 'producer'],
      default: undefined,
    },
    singerName: {
      type: String,
      default: undefined,
    },
    publisher: {
      type: String,
      default: undefined,
    },
    songLanguage: {
      type: String,
      default: undefined,
    },
    musicUsage: {
      type: String,
      default: undefined,
    },
    musicStyle: {
      type: String,
      default: undefined,
    },
    musicMood: {
      type: String,
      default: undefined,
    },
    musicImage: {
      type: String,
      default: undefined,
    },
    music: {
      type: String,
      default: undefined,
    },
    musicLyric: {
      type: String,
      default: undefined,
    },
    musicPlaybackBackground: {
      type: String,
      default: undefined,
    },
    musicInstrument: {
      type: String,
      default: undefined,
    },
    
    // Common metadata
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'active',
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: [{
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User'
    }],
    comments: [{
      userId: {
        type: mongoose.SchemaTypes.ObjectId,
        ref: 'User',
        required: true
      },
      userName: {
        type: String,
        required: true
      },
      comment: {
        type: String,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
  },
  { timestamps: true }
);
module.exports = mongoose.model('ShareMusicCreation', musicCreationSchema);

// add plugin that converts mongoose to json
musicCreationSchema.plugin(toJSON);
musicCreationSchema.plugin(paginate);

/**
 * @typedef Job
 */
const ShareMusicCreation = mongoose.model('ShareMusicCreation', musicCreationSchema);

module.exports = ShareMusicCreation;
