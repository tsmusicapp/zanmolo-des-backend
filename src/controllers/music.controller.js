const httpStatus = require("http-status");
const pick = require("../utils/pick");
const regexFilter = require("../utils/regexFilter");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { musicService, userSpaceService } = require("../services");
const { ObjectId } = require("mongodb");
const fs = require("fs");
const Music = require("../models/music.model");
const User = require("../models/user.model"); // Import User model
const { ShareMusicAsset, ShareMusicCreation } = require("../models");
const LyricsMusic = require("../models/lyrics.model");
const Job = require("../models/job.model");
const { uploadFileToS3 } = require("../utils/s3Upload");
const reportService = require("../services/report.service");

const getContributionsForSong = catchAsync(async (req, res) => {
  const { songName } = req.params;

  if (!songName) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Song name is required");
  }

  const contributions = await musicService.getAllContributionsForSong(songName);

  res.status(httpStatus.OK).send({
    songName,
    totalContributions: contributions.length,
    contributions,
  });
});

const addContributor = catchAsync(async (req, res) => {
  const { musicId } = req.params;
  const userId = req.user.id;
  const userName = req.user.name;
  const profilePicture = req.user.profilePicture || "";

  const { myRole, description } = req.body;

  if (!musicId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Music ID is required");
  }

  if (!Array.isArray(myRole) || myRole.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "At least one role is required");
  }

  if (!description || description.trim().length < 10) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Description must be at least 10 characters",
    );
  }

  // Check if music exists
  const music = await Music.findById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }

  // Check if user already contributed to this music
  const existingContributor = music.contributors.find(
    (contributor) => contributor.userId.toString() === userId,
  );

  if (existingContributor) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "You have already contributed to this music",
    );
  }

  // Add new contributor
  const newContributor = {
    userId: userId,
    userName: userName,
    profilePicture: profilePicture,
    myRole: myRole,
    description: description.trim(),
    contributionDate: new Date(),
  };

  music.contributors.push(newContributor);
  await music.save();

  res.status(httpStatus.OK).send({
    message: `Successfully added your contribution to "${music.songName}"`,
    contributor: newContributor,
    totalContributors: music.contributors.length,
  });
});

const uploadMusic = catchAsync(async (req, res) => {
  console.log("req.body", req.body);
  const userId = req.user.id;
  const userName = req.user.name;

  // Check if this is a contribution to existing music
  const isContribution =
    req.body.isContribution === true || req.body.isContribution === "true";
  const originalMusicId = req.body.originalMusicId;

  // Prepare payload for DB
  const payload = {
    ...req.body,
    createdBy: userId,
    userName: userName,
    musicBackground: null,
  };

  // If this is a contribution, add metadata to track the relationship
  if (isContribution && originalMusicId) {
    payload.isContribution = true;
    payload.originalMusicId = originalMusicId;
    payload.contributionDate = new Date();
  }

  // Save metadata in DB
  const music = await musicService.uploadMusic(payload);

  // Return response with appropriate message
  const responseMessage = isContribution
    ? `Successfully added your contribution to the track "${payload.songName}"`
    : "Music uploaded successfully";

  res.status(httpStatus.CREATED).send({
    ...music.toObject(),
    message: responseMessage,
  });
});

const uploadLyrics = catchAsync(async (req, res) => {
  const userId = req.user?.id || "anonymous";
  const files = req.files;
  const uploaded = {};

  // Upload each file field (e.g., musicImage) to S3
  for (const field in files) {
    const file = files[field][0]; // assuming maxCount: 1
    const s3Response = await uploadFileToS3(file, userId);
    uploaded[field] = s3Response.url;
  }

  // Construct the final payload
  const payload = {
    ...req.body,
    createdBy: userId,
    userName: req.user?.name,
    // musicImage: uploaded.musicImage || null,
    // musicAudio: uploaded.musicAudio || null,
    // musicBackground: uploaded.musicBackground || null,
  };
  console.log("payload", payload);

  const lyrics = await musicService.uploadLyrics(payload);
  res.status(httpStatus.CREATED).send(lyrics);
});

const getMusicBox = catchAsync(async (req, res) => {
  const filter = regexFilter(req.query, ["songName", "singerName", "userName"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await musicService.queryMusicBox(filter, options);
  res.send(result);
});

const getMusicById = catchAsync(async (req, res) => {
  const userId = req.user?.id;
  const result = await musicService.getMusicById(req.params.id, userId);
  // Prevent cached 304; always return fresh data for selected work
  res.set("Cache-Control", "no-store");
  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Work not found");
  }
  res.status(httpStatus.OK).send(result);
});

const getMyMusic = catchAsync(async (req, res) => {
  const music = await musicService.getMyMusic(req.user.id);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }
  res.send(music);
});
const getAllMusic = catchAsync(async (req, res) => {
  let userId = null;
  if (req.user && req.user.id) {
    userId = req.user.id;
  }
  const music = await musicService.getAllMusic(userId);

  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }
  res.send(music);
});
const getAllMusicFollowing = catchAsync(async (req, res) => {
  let userId = null;
  if (req.user && req.user.id) {
    userId = req.user.id;
  }
  const music = await musicService.getAllMusicFollowing(userId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }
  res.send(music);
});

const getPopUpPage = catchAsync(async (req, res) => {
  const music = await musicService.getMusicById(req.params.musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }
  const filter = {
    musicStyle: music.musicStyle,
    _id: { $ne: new ObjectId(music.id || music._id) },
  };
  const recommendation = await musicService.getMusicByGenre(filter);
  res.send({
    music: music,
    recommendation: recommendation,
  });
});

const deleteMusic = catchAsync(async (req, res) => {
  const { musicId } = req.params;

  const music = await musicService.getMusicById(musicId);

  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }

  const directory = `./public/uploads/${req.user.id}`;

  if (music.musicImage) {
    const imagePath = `${directory}/${music.musicImage}`;
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  if (music.musicAudio) {
    const audioPath = `${directory}/${music.musicAudio}`;
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
  }

  if (music.musicBackground) {
    const backgroundPath = `${directory}/${music.musicBackground}`;
    if (fs.existsSync(backgroundPath)) {
      fs.unlinkSync(backgroundPath);
    }
  }

  await musicService.deleteMusic(musicId);

  res.status(httpStatus.OK).send({
    message: "Music deleted successfully", // Success message
  });
});

const updateMusic = catchAsync(async (req, res) => {
  const { musicId } = req.params;

  const music = await musicService.getMusicById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }

  const updateData = { ...req.body };

  const directory = `./public/uploads/${req.user.id}`;

  if (req.files["musicImage"]) {
    if (music.musicImage) {
      const oldImagePath = `${directory}/${music.musicImage}`;
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    updateData.musicImage = req.files["musicImage"][0].path;
  }

  if (req.files["musicAudio"]) {
    if (music.musicAudio) {
      const oldAudioPath = `${directory}/${music.musicAudio}`;
      if (fs.existsSync(oldAudioPath)) {
        fs.unlinkSync(oldAudioPath);
      }
    }
    updateData.musicAudio = req.files["musicAudio"][0].path;
  }

  if (req.files["musicBackground"]) {
    if (music.musicBackground) {
      const oldBackgroundPath = `${directory}/${music.musicBackground}`;
      if (fs.existsSync(oldBackgroundPath)) {
        fs.unlinkSync(oldBackgroundPath);
      }
    }
    updateData.musicBackground = req.files["musicBackground"][0].path;
  }

  const updatedMusic = await musicService.updateMusic(musicId, updateData);

  res.status(httpStatus.OK).send(updatedMusic);
});

const likeMusic = async (req, res) => {
  const { musicId } = req.params;
  const currentUserId = req.user.id;
  try {
    const song = await Music.findById(musicId);
    if (!song) {
      return res.status(404).json({ message: "Song not found" });
    }
    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Toggle like/unlike
    const alreadyLiked = song.likes.some(
      (id) => id.toString() === currentUserId.toString(),
    );
    if (alreadyLiked) {
      // UNLIKE: remove user from song.likes and song from user.likedSongs
      song.likes = song.likes.filter(
        (id) => id.toString() !== currentUserId.toString(),
      );
      user.likedSongs = user.likedSongs.filter(
        (id) => id.toString() !== musicId.toString(),
      );
      await song.save();
      await user.save();
      return res.status(200).json({
        message: "Song unliked successfully",
        likedSongs: user.likedSongs,
        songLikes: song.likes.length,
      });
    } else {
      // LIKE: add user to song.likes and song to user.likedSongs
      song.likes.push(currentUserId);
      user.likedSongs.push(musicId);
      await song.save();
      await user.save();
      return res.status(200).json({
        message: "Song liked successfully",
        likedSongs: user.likedSongs,
        songLikes: song.likes.length,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error liking/unliking song" });
  }
};

const incrementView = async (req, res) => {
  const { musicId } = req.params;
  // Handle guest users gracefully - just return success without incrementing
  if (!req.user || !req.user.id) {
    // Optionally we could track anonymous views separately, but for now just don't crash
    // Try to find item to return current count at least
    try {
      let item = await Music.findById(musicId);
      if (!item) item = await ShareMusicCreation.findById(musicId);
      if (!item) item = await ShareMusicAsset.findById(musicId);

      if (item) {
        return res.status(200).json({
          message: "View count retrieved",
          views: item.views || [],
        });
      }
    } catch (e) {
      // Ignore error for guest lookup
    }
    return res.status(200).json({ message: "Guest view acknowledged" });
  }

  const currentUserId = req.user.id.toString();

  try {
    // Try to find in Music collection first
    let item = await Music.findById(musicId);

    // If not found in Music, try ShareMusicCreation (design works)
    if (!item) {
      item = await ShareMusicCreation.findById(musicId);
    }

    // If still not found, try ShareMusicAsset
    if (!item) {
      item = await ShareMusicAsset.findById(musicId);
    }

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Initialize views array if it doesn't exist
    if (!item.views) {
      item.views = [];
    }

    // Check if owner - don't increment but return success (status 200 instead of 500)
    if (item.createdBy && currentUserId == item.createdBy.toString()) {
      return res.status(200).json({
        message: "Owner view (not counted)",
        views: item.views,
      });
    }

    // Increment view count if not already viewed
    const alreadyViewed = item.views.some(
      (id) => id && id.toString() === currentUserId,
    );

    if (!alreadyViewed) {
      item.views.push(currentUserId);
      await item.save();
    }

    return res.status(200).json({
      message: "View count updated successfully",
      views: item.views,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error incrementing view count" });
  }
};
const collectMusic = async (req, res) => {
  const { musicId } = req.params;
  const { type } = req.body; // type: 'songs' atau 'lyrics'
  const currentUserId = req.user.id;
  try {
    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let item, itemType;
    if (type === "lyrics") {
      item = await LyricsMusic.findById(musicId);
      itemType = "lyrics";
      if (!item) {
        return res.status(404).json({ message: "Lyrics not found" });
      }
    } else {
      // First try ShareMusicAsset collection
      item = await ShareMusicAsset.findById(musicId);
      if (!item) {
        // If not found in ShareMusicAsset, try Music collection
        const Music = require("../models/music.model");
        item = await Music.findById(musicId);
      }
      itemType = "music";
      if (!item) {
        return res.status(404).json({ message: "Song not found" });
      }
    }
    if (currentUserId === item.createdBy.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot collected your work" });
    }
    // Toggle collect/uncollect
    const alreadyCollected = user.collections.includes(musicId);
    if (alreadyCollected) {
      user.collections = user.collections.filter(
        (id) => id.toString() !== musicId.toString(),
      );
      await user.save();
      return res.status(200).json({
        message: `${
          itemType.charAt(0).toUpperCase() + itemType.slice(1)
        } uncollected successfully`,
        collections: user.collections,
        type: itemType,
      });
    } else {
      user.collections.push(musicId);
      await user.save();
      return res.status(200).json({
        message: `${
          itemType.charAt(0).toUpperCase() + itemType.slice(1)
        } collected successfully`,
        collections: user.collections,
        type: itemType,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error collecting/uncollecting" });
  }
};

const commentOnMusic = catchAsync(async (req, res) => {
  const { musicId } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;

  const music = await musicService.getMusicById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }

  const newComment = {
    userId,
    comment,
    createdAt: new Date(),
  };

  // Instead of push + save:
  await Music.findByIdAndUpdate(musicId, {
    $push: { comments: newComment },
  });

  res
    .status(httpStatus.CREATED)
    .send({ message: "Comment added successfully", comment: newComment });
});

const addRating = async (req, res) => {
  const { musicId } = req.params; // Get musicId from URL parameter
  const { rating } = req.body; // Get rating from request body
  const userId = req.user.id; // Assuming user authentication has been done and user ID is available

  console.log("Rating value:", rating);
  // Validate the rating
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }

  try {
    // Convert musicId to ObjectId before querying
    const music = await musicService.getMusicById(musicId);

    console.log("musicId:", musicId);
    console.log("music:", music);
    if (!music) {
      return res.status(404).json({ message: "Song not found" });
    }

    const existingRating = music.ratings.find(
      (r) => r.userId.toString() === userId,
    );

    if (existingRating) {
      existingRating.rating = rating;
      existingRating.createdAt = Date.now(); // Update the timestamp
    } else {
      music.ratings.push({ userId, rating });
    }

    // Save the updated music document
    await music.save();

    const averageRating = music.calculateAverageRating();

    res.status(200).json({
      message: "Rating added successfully",
      averageRating,
      ratings: music.ratings, // Return the updated list of ratings
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error while adding rating" });
  }
};

const getLikedSongs = catchAsync(async (req, res) => {
  const music = await musicService.getLikedMusic(req.user.id);
  res.status(200).json(music);
});

const followUser = catchAsync(async (req, res) => {
  const currentUserId = req.user.id;
  const { userId: targetUserId } = req.params;
  if (currentUserId === targetUserId) {
    return res.status(400).json({ message: "You cannot follow yourself" });
  }
  const currentUser = await User.findById(currentUserId);
  const targetUser = await User.findById(targetUserId);
  if (!currentUser || !targetUser) {
    return res.status(400).json({ message: "User not found" });
  }
  const alreadyFollowing = currentUser.following.some(
    (id) => id.toString() === targetUserId,
  );
  if (alreadyFollowing) {
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== targetUserId,
    );
    await currentUser.save();
    return res
      .status(200)
      .json({
        message: "Unfollowed successfully",
        following: currentUser.following,
      });
  }
  // Follow
  currentUser.following.push(targetUserId);
  await currentUser.save();
  return res
    .status(200)
    .json({
      message: "Followed successfullys",
      following: currentUser.following,
    });
});

const getTopWorkByUser = async (userId) => {
  // Ambil 2 teratas dari gabungan music, lyrics, shareAssets berdasarkan like terbanyak
  const [music, lyrics, shareAssets] = await Promise.all([
    Music.find({ createdBy: userId }),
    LyricsMusic.find({ createdBy: userId }),
    ShareMusicAsset.find({ createdBy: userId }),
  ]);
  // Normalisasi semua ke format seragam
  const allWorks = [
    ...music.map((item) => ({
      ...item.toObject(),
      type: "music",
      likesCount: (item.likes || []).length,
      id: item._id.toString(),
      songName: item.songName || "",
      musicImage: item.musicImage || "",
    })),
    ...lyrics.map((item) => ({
      ...item.toObject(),
      type: "lyrics",
      likesCount: (item.likes || []).length,
      id: item._id.toString(),
      songName: item.lyricName || "",
      musicImage: item.musicImage || "",
    })),
    ...shareAssets.map((item) => ({
      ...item.toObject(),
      type: "shareAsset",
      likesCount: (item.likes || []).length,
      id: item._id.toString(),
      songName: item.songName || "",
      musicImage: item.musicImage || "",
    })),
  ];
  // Urutkan berdasarkan likesCount terbanyak, ambil maksimal 2
  allWorks.sort((a, b) => b.likesCount - a.likesCount);
  return allWorks.slice(0, 4);
};

const getFollowingList = catchAsync(async (req, res) => {
  const users = await User.find({ isEmailVerified: true }).select(
    "id name email profilePicture createdAt",
  );
  const currentUser = await User.findById(req.user.id).select("id following");
  const allUsers = await User.find({}).select("collections"); // Ambil semua koleksi user
  const usersWithSpace = (
    await Promise.all(
      users.map(async (user) => {
        const userSpace = await userSpaceService.getSpace(user.id);
        const checkFollowing = currentUser.following.includes(user.id);
        // Gabungkan top work (music/lyric/shareAsset) max 2 berdasarkan like terbanyak
        const topWork = await getTopWorkByUser(user.id);
        // Hitung total likes dari semua karya user
        let totalLikes = 0;
        if (topWork && Array.isArray(topWork)) {
          totalLikes = topWork.reduce(
            (sum, work) => sum + (work.likesCount || 0),
            0,
          );
        }
        // Cari semua karya user (music, lyrics, shareAssets)
        const [music, lyrics, shareAssets] = await Promise.all([
          Music.find({ createdBy: user.id }).select("_id"),
          LyricsMusic.find({ createdBy: user.id }).select("_id"),
          ShareMusicAsset.find({ createdBy: user.id }).select("_id"),
        ]);
        const allWorkIds = [
          ...music.map((m) => m._id.toString()),
          ...lyrics.map((l) => l._id.toString()),
          ...shareAssets.map((s) => s._id.toString()),
        ];
        // Hitung totalCollect: berapa kali karya user ada di collections user lain
        let totalCollect = 0;
        allUsers.forEach((u) => {
          if (u.collections && Array.isArray(u.collections)) {
            totalCollect += u.collections.filter((cid) =>
              allWorkIds.includes(cid.toString()),
            ).length;
          }
        });
        // Only include topWork if it exists and has length > 0
        if (!topWork || !Array.isArray(topWork) || topWork.length === 0) {
          return null;
        }
        return userSpace
          ? {
              id: user.id,
              profilePicture: userSpace.profilePicture,
              myRole: userSpace.creationOccupation,
              userName: userSpace.firstName + " " + userSpace.lastName,
              isFollowing: checkFollowing,
              topWork,
              createdAt: user.createdAt,
              coverUrl: userSpace.coverUrl,
              country: userSpace.address?.split(",")[0] || "",
              totalLikes,
              totalCollect,
              myService: userSpace.myServices,
            }
          : null;
      }),
    )
  ).filter(Boolean);

  res.status(200).json(usersWithSpace);
});

const getMyCollections = catchAsync(async (req, res) => {
  const music = await musicService.getMyCollections(req.user.id);
  res.status(200).json(music);
});

const getMyFollowing = catchAsync(async (req, res) => {
  const music = await musicService.getMyFollowing(req.user.id);
  res.status(200).json(music);
});

// Like music or lyricsmusic by type param
const likeMusicOrLyrics = async (req, res) => {
  const { musicId } = req.params;
  const { type } = req.body; // type: 'music' or 'lyrics'
  const currentUserId = req.user.id;

  try {
    if (type === "lyrics") {
      // Cek juga koleksi 'lyricsmusics' secara eksplisit jika LyricsMusic.findById gagal
      let lyrics = await LyricsMusic.findById(musicId);
      if (!lyrics) {
        // Coba cari di koleksi 'lyricsmusics' secara eksplisit
        lyrics = await LyricsMusic.collection.findOne({
          _id: new ObjectId(musicId),
        });

        if (lyrics) {
          console.log("Lyrics found in collection:", lyrics);
          if (currentUserId === lyrics.createdBy.toString()) {
            return res
              .status(400)
              .json({ message: "You cannot like your work" });
          }
          // Perlu update manual array likes
          const alreadyLiked = (lyrics.likes || []).some(
            (id) => id.toString() === currentUserId.toString(),
          );
          if (alreadyLiked) {
            await LyricsMusic.collection.updateOne(
              { _id: new ObjectId(musicId) },
              { $pull: { likes: new ObjectId(currentUserId) } },
            );
            return res.status(200).json({
              message: "Lyrics unliked successfully",
              type: "lyrics",
            });
          } else {
            await LyricsMusic.collection.updateOne(
              { _id: new ObjectId(musicId) },
              { $addToSet: { likes: new ObjectId(currentUserId) } },
            );
            return res.status(200).json({
              message: "Lyrics liked successfully",
              type: "lyrics",
            });
          }
        }
        return res.status(404).json({ message: "Lyrics not found" });
      }
      // Normal mongoose document
      const alreadyLiked = lyrics.likes.some(
        (id) => id.toString() === currentUserId.toString(),
      );
      console.log("Lyrics found in collection:", lyrics);
      if (currentUserId === lyrics.createdBy.toString()) {
        return res.status(400).json({ message: "You cannot like your work" });
      }
      if (alreadyLiked) {
        lyrics.likes = lyrics.likes.filter(
          (id) => id.toString() !== currentUserId.toString(),
        );
        await lyrics.save();
        return res.status(200).json({
          message: "Lyrics unliked successfully",
          likes: lyrics.likes.length,
          type: "lyrics",
        });
      } else {
        lyrics.likes.push(currentUserId);
        await lyrics.save();
        return res.status(200).json({
          message: "Lyrics liked successfully",
          likes: lyrics.likes.length,
          type: "lyrics",
        });
      }
    } else {
      // default: music
      const user = await User.findById(currentUserId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const song = await Music.findById(musicId);

      // ShareMusicAsset
      if (!song) {
        const shareMusicAsset = await ShareMusicAsset.findById(musicId);
        if (!shareMusicAsset) {
          // Check for ShareMusicCreation (design/music creations)
          const shareMusicCreation = await ShareMusicCreation.findById(musicId);
          if (!shareMusicCreation) {
            return res
              .status(404)
              .json({ message: "ShareMusicAsset not found" });
          }
          if (currentUserId === shareMusicCreation.createdBy.toString()) {
            return res
              .status(400)
              .json({ message: "You cannot like your work" });
          }
          const alreadyLiked = shareMusicCreation.likes.some(
            (id) => id.toString() === currentUserId.toString(),
          );
          if (alreadyLiked) {
            shareMusicCreation.likes = shareMusicCreation.likes.filter(
              (id) => id.toString() !== currentUserId.toString(),
            );
          } else {
            shareMusicCreation.likes.push(currentUserId);
          }
          await shareMusicCreation.save();
          return res.status(200).json({
            message: alreadyLiked
              ? "ShareMusicCreation unliked successfully"
              : "ShareMusicCreation liked successfully",
            likes: shareMusicCreation.likes.length,
            type: "creations",
          });
        }
        if (currentUserId === shareMusicAsset.createdBy.toString()) {
          return res.status(400).json({ message: "You cannot like your work" });
        }
        const alreadyLiked = shareMusicAsset.likes.some(
          (id) => id.toString() === currentUserId.toString(),
        );
        if (alreadyLiked) {
          shareMusicAsset.likes = shareMusicAsset.likes.filter(
            (id) => id.toString() !== currentUserId.toString(),
          );
        } else {
          shareMusicAsset.likes.push(currentUserId);
        }
        await shareMusicAsset.save();
        return res.status(200).json({
          message: alreadyLiked
            ? "ShareMusicAsset unliked successfully"
            : "ShareMusicAsset liked successfully",
          likes: shareMusicAsset.likes.length,
          type: "assets",
        });
      }
      // ShareMusicAsset

      if (currentUserId === song.createdBy.toString()) {
        return res.status(400).json({ message: "You cannot like your work" });
      }
      const alreadyLiked = song.likes.some(
        (id) => id.toString() === currentUserId.toString(),
      );
      if (alreadyLiked) {
        song.likes = song.likes.filter(
          (id) => id.toString() !== currentUserId.toString(),
        );
        user.likedSongs = user.likedSongs.filter(
          (id) => id.toString() !== musicId.toString(),
        );
        await song.save();
        await user.save();
        return res.status(200).json({
          message: "Song unliked successfully",
          likedSongs: user.likedSongs,
          likes: song.likes.length,
          type: "music",
        });
      } else {
        song.likes.push(currentUserId);
        user.likedSongs.push(musicId);
        await song.save();
        await user.save();
        return res.status(200).json({
          message: "Song liked successfully",
          likedSongs: user.likedSongs,
          likes: song.likes.length,
          type: "music",
        });
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error liking/unliking" });
  }
};

const getMusicUser = catchAsync(async (req, res) => {
  const music = await musicService.getMusicByUser(req.params.userId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, "Music not found");
  }
  res.send(music);
});

const reportContent = catchAsync(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { reason = "", description = "" } = req.body;

  // Cek apakah id milik music
  let content = await Music.findById(id);
  let reportedUserId = null;
  let type = null;
  if (content) {
    reportedUserId = content.createdBy;
    type = "music";
  } else {
    // Jika tidak, cek di lyrics
    content = await LyricsMusic.findById(id);
    if (content) {
      reportedUserId = content.createdBy;
      type = "lyrics";
    } else {
      // Jika tidak, cek di shareAssets
      content = await ShareMusicAsset.findById(id);
      if (content) {
        reportedUserId = content.createdBy;
        type = "assets";
      }
    }
  }

  if (!content) {
    throw new ApiError(httpStatus.NOT_FOUND, "Content not found");
  }

  // Cek apakah user sudah pernah report konten ini
  const existingReport = await reportService.findReport({
    userId,
    type,
    reportedId: id,
  });
  if (existingReport) {
    return res
      .status(httpStatus.BAD_REQUEST)
      .json({ message: "You have already reported this content." });
  }

  await reportService.createReport({
    userId,
    type,
    reportedId: id,
    reportedUserId,
    reason,
    description,
  });

  res
    .status(httpStatus.CREATED)
    .json({ message: "Report submitted successfully" });
});

const searchAllAssets = catchAsync(async (req, res) => {
  const q = req.query.q || "";
  const Gig = require("../models/gig.model");

  // Define regex once untuk semua penggunaan
  const regex = q.trim() !== "" ? new RegExp(q, "i") : null;

  // Jika query kosong, tampilkan semua data
  let musicSearchCondition = {};
  let gigSearchCondition = {};
  let jobSearchCondition = {};
  let creationSearchCondition = {};
  let assetSearchCondition = {};

  if (regex) {
    musicSearchCondition = {
      $or: [
        { songName: regex },
        { singerName: regex },
        { publisher: regex },
        { tags: regex },
        { description: regex },
        { albumname: regex },
        { songLanguage: regex },
        { musicCulturalRegion: regex },
        { musicUsage: regex },
        { myRole: regex },
      ],
    };

    gigSearchCondition = {
      $or: [
        { title: regex },
        { description: regex },
        { category: regex },
        { tags: regex },
      ],
    };

    jobSearchCondition = {
      $or: [
        { projectTitle: regex },
        { description: regex },
        { category: regex },
        { position: regex },
      ],
    };

    creationSearchCondition = {
      $or: [
        { title: regex },
        { description: regex },
        { tags: regex },
        { musicName: regex },
        { singerName: regex },
        { category: regex },
        { subcategory: regex },
      ],
    };

    assetSearchCondition = {
      $or: [
        { title: regex },
        { description: regex },
        { tags: regex },
        { category: regex },
        { subcategory: regex },
      ],
    };
  }

  // Cari di semua tabel secara paralel
  const [music, gigs, jobs, creations, assets] = await Promise.all([
    Music.find(musicSearchCondition).lean(),
    Gig.find(gigSearchCondition).lean(),
    Job.find(jobSearchCondition).lean(),
    ShareMusicCreation.find(creationSearchCondition).lean(),
    ShareMusicAsset.find(assetSearchCondition).lean(),
  ]);

  // Kumpulkan semua user IDs yang unik
  const allUserIds = [
    ...new Set(
      [
        ...music.map((item) => item.createdBy),
        ...gigs.map((item) => item.seller?.toString()),
        ...jobs.map((item) => item.createdBy),
        ...creations.map((item) => item.createdBy),
        ...assets.map((item) => item.createdBy?.toString()),
      ].filter(Boolean),
    ),
  ];

  // Ambil user info sekali saja
  const userSpaces = await require("../models/userSpace.model")
    .find({
      createdBy: { $in: allUserIds },
    })
    .lean();

  const userMap = {};
  userSpaces.forEach((user) => {
    userMap[user.createdBy] = {
      userName:
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.userName ||
        "Unknown User",
      profilePicture: user.profilePicture || "",
    };
  });

  // Enrich music dengan user info dan contributors
  const enrichedMusic = music.map((item) => {
    const enrichedItem = {
      ...item,
      userName:
        userMap[item.createdBy]?.userName || item.userName || "Unknown User",
      profilePicture: userMap[item.createdBy]?.profilePicture || "",
    };

    let contributors = [];
    const originalCreator = {
      userId: item.createdBy,
      userName: enrichedItem.userName,
      profilePicture: enrichedItem.profilePicture,
      myRole: Array.isArray(item.myRole)
        ? item.myRole
        : [item.myRole || "creator"],
      description: item.description || "",
      contributionDate: item.createdAt || new Date(),
    };

    if (
      item.contributors &&
      Array.isArray(item.contributors) &&
      item.contributors.length > 0
    ) {
      contributors.push(originalCreator);
      const otherContributors = item.contributors.map((contributor) => ({
        userId: contributor.userId || contributor.id,
        userName: contributor.userName || "Unknown User",
        profilePicture: contributor.profilePicture || "",
        myRole: Array.isArray(contributor.myRole)
          ? contributor.myRole
          : [contributor.myRole || ""],
        description: contributor.description || "",
        contributionDate:
          contributor.contributionDate || contributor.createdAt || new Date(),
      }));
      contributors.push(...otherContributors);
    } else {
      contributors = [originalCreator];
    }

    enrichedItem.contributors = contributors;
    return enrichedItem;
  });

  // Enrich gigs dengan user info
  const enrichedGigs = gigs.map((item) => ({
    ...item,
    userName: userMap[item.seller?.toString()]?.userName || "Unknown User",
    profilePicture: userMap[item.seller?.toString()]?.profilePicture || "",
  }));

  // Enrich jobs dengan user info
  const enrichedJobs = jobs.map((item) => ({
    ...item,
    userName: userMap[item.createdBy]?.userName || "Unknown User",
    profilePicture: userMap[item.createdBy]?.profilePicture || "",
  }));

  // Enrich creations dengan user info
  const enrichedCreations = creations.map((item) => ({
    ...item,
    userName: userMap[item.createdBy]?.userName || "Unknown User",
    profilePicture: userMap[item.createdBy]?.profilePicture || "",
  }));

  // Enrich assets dengan user info
  const enrichedAssets = assets.map((item) => ({
    ...item,
    userName: userMap[item.createdBy?.toString()]?.userName || "Unknown User",
    profilePicture: userMap[item.createdBy?.toString()]?.profilePicture || "",
  }));

  // Normalisasi hasil dengan format yang konsisten
  const filterByArtist = (item) =>
    item.userName &&
    item.userName !== "Unknown User" &&
    item.userName.trim() !== "";

  const musicResult = enrichedMusic
    .map((item) => ({
      id: item._id,
      title: item.songName,
      type: "music",
      ...item,
    }))
    .filter(filterByArtist);

  const gigResult = enrichedGigs
    .map((item) => ({
      id: item._id,
      title: item.title,
      type: "gig",
      ...item,
    }))
    .filter(filterByArtist);

  const jobResult = enrichedJobs
    .map((item) => ({
      id: item._id,
      title: item.projectTitle,
      type: "job",
      ...item,
    }))
    .filter(filterByArtist);

  const creationResult = enrichedCreations
    .map((item) => ({
      id: item._id,
      title: item.title,
      type: "creation",
      ...item,
    }))
    .filter(filterByArtist);

  const assetResult = enrichedAssets
    .map((item) => ({
      id: item._id,
      title: item.title,
      type: "asset",
      ...item,
    }))
    .filter(filterByArtist);

  // Gabungkan semua hasil
  const allResults = [
    ...musicResult,
    ...gigResult,
    ...jobResult,
    ...creationResult,
    ...assetResult,
  ];

  const result = {
    music: allResults,
    total: allResults.length,
  };

  console.log(
    "🔍 Search results - Music:",
    musicResult.length,
    "Gigs:",
    gigResult.length,
    "Jobs:",
    jobResult.length,
    "Creations:",
    creationResult.length,
    "Assets:",
    assetResult.length,
    "Total:",
    result.total,
  );
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  uploadMusic,
  uploadLyrics,
  getMusicBox,
  getPopUpPage,
  deleteMusic,
  updateMusic,
  getMusicById,
  commentOnMusic,
  likeMusic,
  incrementView,
  addRating,
  getLikedSongs,
  getMyMusic,
  getAllMusic,
  followUser,
  getFollowingList,
  getMyCollections,
  collectMusic,
  getMyFollowing,
  likeMusicOrLyrics,
  getAllMusicFollowing,
  getMusicUser,
  reportContent,
  searchAllAssets,
  getContributionsForSong,
  addContributor,
};
