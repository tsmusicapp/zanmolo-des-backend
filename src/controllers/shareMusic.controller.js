const httpStatus = require('http-status');
const pick = require('../utils/pick');
const regexFilter = require('../utils/regexFilter');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { shareMusicService, musicService } = require('../services');
const ShareMusicCreation = require('../models/shareMusicCreation.model');

const shareAsset = catchAsync(async (req, res) => {
  const { aiCustomInstructions, ...restBody } = req.body;
  const payload = {
    ...restBody,
    additionalInformation: aiCustomInstructions || "",
    createdBy: req.user.id,
    updatedBy: req.user.id,
    userName: req.user.name,
  };
  const shareMusicAsset = await shareMusicService.shareAsset(payload);
  res.status(httpStatus.CREATED).send(shareMusicAsset);
});

const getAssets = catchAsync(async (req, res) => {
  let result = [];
    result = await shareMusicService.getAllAssets(req.user.id);

  res.send(result);
});
// Tanpa auth: copy dari getAssets tapi tidak pakai req.user.id
const getAssetsUser = catchAsync(async (req, res) => {
  // Jika ada param id, ambil asset milik user tertentu
  const result = await shareMusicService.getAssets(req.params.id);
  res.send(result);
});

const getMyAssets = catchAsync(async (req, res) => {
  let result = [];
    result = await shareMusicService.getMyAssets(req.user.id);

  res.send(result);
});

const getAssetsById = catchAsync(async (req, res) => {
  const userId = req.user && req.user.id;
  const result = await shareMusicService.getAssetsById(req.params.id, userId);
  if (!result) {
    const music = await musicService.getMusicById(req.params.id, userId);
    if (!music) {
      // Check for ShareMusicCreation first (since lyricsService doesn't exist)
      const creation = await shareMusicService.getCreationById(req.params.id);
      if (!creation) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Music or Creation not found');
      }
      return res.send(creation);
    }
    return res.send(music);
  }
  return res.send(result)
})

const shareCreation = catchAsync(async (req, res) => {
  const { workType, ...bodyData } = req.body;
  
  // Filter out music-specific fields when creating design work
  let filteredData = { ...bodyData };
  if (workType === 'design') {
    const musicFields = [
      'musicName', 'myRole', 'singerName', 'publisher', 'songLanguage',
      'musicUsage', 'musicStyle', 'musicMood', 'musicImage', 'music',
      'musicLyric', 'musicPlaybackBackground', 'musicInstrument'
    ];
    musicFields.forEach(field => {
      delete filteredData[field];
    });
  }
  
  const payload = {
    workType,
    ...filteredData,
    createdBy: req.user.id,
    updatedBy: req.user.id,
    userName: req.user.name,
  };
  const shareMusicCreation = await shareMusicService.shareCreation(payload);
  res.status(httpStatus.CREATED).send(shareMusicCreation);
});

const getCreation = catchAsync(async (req, res) => {
  const result = await shareMusicService.getCreation(req.user.id);
  res.send(result);
});

const getCreationbyId = catchAsync(async (req, res) => {
  const result = await shareMusicService.getCreationById(req.params.id);
  res.send(result);
});

const getAllCreations = catchAsync(async (req, res) => {
  let userId = null;
  if (req.user && req.user.id) {
    userId = req.user.id;
  }
  const result = await shareMusicService.getAllCreations(userId);
  res.send(result);
});


const addToCart = catchAsync(async (req, res) => {

  const assetId = req.params.id;
  const userId = req.user.id;

  const cart = await shareMusicService.addToCart(userId, assetId);
  res.status(httpStatus.CREATED).send(cart);

});

const getCart = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming authentication middleware sets `req.user`
    const result = await shareMusicService.getCart(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { assetId } = req.params // Assuming authentication middleware sets `req.user`
    const result = await shareMusicService.deleteCart(userId, assetId);

    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const finalItem = async (req, res) => {
  try {
    const userId = req.user.id;

    const { saleData } = req.body;

    const result = await shareMusicService.addSale(saleData, userId);

    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

const getSales = async (req, res) => {
  try {
    const userId = req.user.id;

    let result;
      result = await shareMusicService.getSales(userId);


    if (!result.success) {
      res.status(400).json({ success: false, message: result.message });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const commentOnCreation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userName = req.user.name;

  const creation = await ShareMusicCreation.findById(id);
  if (!creation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Creation not found');
  }

  const newComment = {
    userId,
    userName,
    comment,
    createdAt: new Date(),
  };

  // Add comment to the creation
  creation.comments.push(newComment);
  await creation.save();

  res.status(httpStatus.CREATED).send({ 
    message: 'Comment added successfully', 
    comment: newComment 
  });
});

const collectCreation = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const creation = await ShareMusicCreation.findById(id);
  if (!creation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Creation not found');
  }

  // Check if user is trying to collect their own work
  if (userId === creation.createdBy.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot collect your own work');
  }

  // Get user to manage collections
  const { User } = require('../models');
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Toggle collect/uncollect
  const alreadyCollected = user.collections.includes(id);
  if (alreadyCollected) {
    user.collections = user.collections.filter(collectionId => collectionId.toString() !== id);
    await user.save();
    res.status(httpStatus.OK).send({
      message: 'Creation uncollected successfully',
      collections: user.collections
    });
  } else {
    user.collections.push(id);
    await user.save();
    res.status(httpStatus.OK).send({
      message: 'Creation collected successfully',
      collections: user.collections
    });
  }
});

module.exports = {
  shareAsset,
  getAssets,
  getAssetsUser,
  getAssetsById,
  shareCreation,
  getCreation,
  getCreationbyId,
  getAllCreations,
  addToCart,
  getCart,
  deleteCart,
  finalItem,
  getSales,
  getMyAssets,
  commentOnCreation,
  collectCreation
};
