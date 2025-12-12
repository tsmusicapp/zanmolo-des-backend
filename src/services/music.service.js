const httpStatus = require('http-status');
const { Music, LyricsMusic, User, UserSpace } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a user
 * @param {Object} musicBody
 * @returns {Promise<User>}
 * 
 * @param {Object} lyricBody
 * @returns {Promise<User>}
 */
/**
 * Get all contributions for a specific song
 * @param {string} songName - Song name to find contributions for
 * @returns {Promise<Array>}
 */
const getAllContributionsForSong = async (songName) => {
  // Find all music entries with the same song name (case-insensitive)
  const musicContributions = await Music.find({
    songName: { $regex: new RegExp(`^${songName}$`, 'i') }
  }).populate('createdBy', 'name email').sort({ createdAt: 1 });

  // Also check ShareMusicAsset for the same song
  const ShareMusicAsset = require('../models/shareMusicAsset.model');
  const assetContributions = await ShareMusicAsset.find({
    songName: { $regex: new RegExp(`^${songName}$`, 'i') }
  }).populate('createdBy', 'name email').sort({ createdAt: 1 });

  // Combine and format the results
  const allContributions = [];

  // Add music contributions
  musicContributions.forEach(music => {
    allContributions.push({
      id: music._id,
      type: 'music',
      songName: music.songName,
      contributor: {
        id: music.createdBy,
        name: music.userName || (music.createdBy?.name || 'Unknown'),
        email: music.createdBy?.email,
      },
      roles: music.myRole || [],
      description: music.description || '',
      createdAt: music.createdAt,
      isContribution: music.isContribution || false,
      originalMusicId: music.originalMusicId,
      musicStyle: music.musicStyle,
      musicMood: music.musicMood,
      tags: music.tags || []
    });
  });

  // Add asset contributions
  assetContributions.forEach(asset => {
    allContributions.push({
      id: asset._id,
      type: 'asset',
      songName: asset.songName,
      contributor: {
        id: asset.createdBy,
        name: asset.createdBy?.name || 'Unknown',
        email: asset.createdBy?.email,
      },
      roles: asset.myRole || [],
      description: asset.description || '',
      createdAt: asset.createdAt,
      isContribution: false, // ShareMusicAsset doesn't have this field yet
      musicStyle: asset.musicStyle,
      musicMood: asset.musicMood,
      tags: asset.tags || []
    });
  });

  // Sort by creation date
  allContributions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return allContributions;
};

const uploadMusic = async (musicBody) => {
  return Music.create(musicBody);
};

const uploadLyrics = async(lyricBody) =>{
  return LyricsMusic.create(lyricBody);
}
/**
 * Query for music box
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryMusicBox = async (filter, options) => {
  const musicBox = await Music.paginate(filter, options);
  return musicBox;
};

/**
 * Get music by id
 * @param {ObjectId} id
 * @param {string} [userId] - Optional user id to check if liked
 * @returns {Promise<Music>}
 */
const getMusicById = async (id, userId = null) => {
  // Try finding music by id in Music collection
  const music = await Music.findById(id);
  if (music) {
    const obj = music.toObject();

    // Find userSpace for the creator of the music
    const userSpace = obj.createdBy
      ? await UserSpace.findOne({ createdBy: obj.createdBy }).lean()
      : null;

    const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
    const profilePicture = userSpace?.profilePicture || '';

    // Tambahkan pengecekan isLiked
    let isLiked = false;
    if (userId && Array.isArray(obj.likes)) {
      isLiked = obj.likes.some(likeId => likeId.toString() === userId.toString());
    }
    let isCollected = false;
    let isFollowing = false;
    
    const user = await User.findById(userId).select('collections following');
    if (user && Array.isArray(user.collections)) {
      isCollected = user.collections.some(collectionId => collectionId.toString() === id.toString());
    }
    if (user && Array.isArray(user.following)) {
      isFollowing = user.following.some(followingId => followingId.toString() === obj.createdBy.toString());
    }

    return {
      ...obj,
      id: obj._id.toString(),
      profilePicture,
      userName,
      hiring: userSpace?.hiring || '',
      isLyric: false,
      isLiked,
      isCollected,
      isFollowing
    };
  }

  // If not found in Music, try LyricsMusic collection
  const lyric = await LyricsMusic.findById(id);
  if (lyric) {
    // Find userSpace for the creator of the lyric
    const userSpace = lyric.createdBy
      ? await UserSpace.findOne({ createdBy: lyric.createdBy }).lean()
      : null;

    const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
    const profilePicture = userSpace?.profilePicture || '';
    // Tambahkan pengecekan isLiked
    let isLiked = false;
    if (userId && Array.isArray(lyric.likes)) {
      isLiked = lyric.likes.some(likeId => likeId.toString() === userId.toString());
    }
    let isCollected = false;
    let isFollowing = false;

    const user = await User.findById(userId).select('collections following');
    if (user && Array.isArray(user.collections)) {
      isCollected = user.collections.some(collectionId => collectionId.toString() === id.toString());
    }
    if (user && Array.isArray(user.following)) {
      isFollowing = user.following.some(followingId => followingId.toString() === lyric.createdBy.toString());
    }

    return {
      myRole: userSpace?.creationOccupation || [],
      tags: lyric.tags || [],
      likes: lyric.likes || [],
      songName: lyric.lyricName,
      singerName: '',
      publisher: '',
      albumname: '',
      songLanguage: lyric.lyricLanguage,
      musicUsage: [],
      musicStyle: lyric.lyricStyle,
      musicMood: lyric.lyricMood,
      musicInstrument: '',
      description: lyric.description,
      softwareTool: '',
      musicLyric: lyric.writeLyric,
      createdBy: lyric.createdBy,
      musicImage: lyric.musicImage,
      musicAudio: null,
      musicBackground: null,
      ratings: [],
      id: lyric._id.toString(),
      isLyric: true,
      profilePicture,
      userName,
      hiring: userSpace?.hiring || '',
      isLiked,
      isCollected,
      isFollowing
    };
  }

  // If not found in both collections, try ShareMusicCreation
  const ShareMusicCreation = require('../models/shareMusicCreation.model');
  const creation = await ShareMusicCreation.findById(id);
  if (creation) {
    const userSpace = creation.createdBy
      ? await UserSpace.findOne({ createdBy: creation.createdBy }).lean()
      : null;

    const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
    const profilePicture = userSpace?.profilePicture || '';

    // Flags
    let isLiked = false;
    if (userId && Array.isArray(creation.likes)) {
      isLiked = creation.likes.some(likeId => likeId.toString() === userId.toString());
    }
    let isCollected = false;
    let isFollowing = false;

    const user = await User.findById(userId).select('collections following');
    if (user && Array.isArray(user.collections)) {
      isCollected = user.collections.some(collectionId => collectionId.toString() === id.toString());
    }
    if (user && Array.isArray(user.following)) {
      isFollowing = user.following.some(followingId => followingId.toString() === creation.createdBy.toString());
    }

    return {
      id: creation._id.toString(),
      type: 'creation',
      title: creation.title,
      description: creation.description,
      tags: creation.tags || [],
      likes: creation.likes || [],
      embeds: creation.embeds || '',
      workImages: creation.workImages || [],
      musicImage: creation.musicImage || (Array.isArray(creation.workImages) && creation.workImages.length > 0 ? creation.workImages[0] : ''),
      workType: creation.workType || 'music',
      category: creation.category || '',
      subcategory: creation.subcategory || '',
      softwareTool: creation.softwareTool || [],
      createdBy: creation.createdBy,
      profilePicture,
      userName,
      hiring: userSpace?.hiring || '',
      isLyric: false,
      isLiked,
      isCollected,
      isFollowing,
      views: creation.views || 0,
    };
  }

  // If not found, try ShareMusicAsset
  const ShareMusicAsset = require('../models/shareMusicAsset.model');
  const asset = await ShareMusicAsset.findById(id);
  if (asset) {
    const userSpace = asset.createdBy
      ? await UserSpace.findOne({ createdBy: asset.createdBy }).lean()
      : null;

    const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
    const profilePicture = userSpace?.profilePicture || '';

    // Flags
    let isLiked = false;
    if (userId && Array.isArray(asset.likes)) {
      isLiked = asset.likes.some(likeId => likeId.toString() === userId.toString());
    }
    let isCollected = false;
    let isFollowing = false;

    const user = await User.findById(userId).select('collections following');
    if (user && Array.isArray(user.collections)) {
      isCollected = user.collections.some(collectionId => collectionId.toString() === id.toString());
    }
    if (user && Array.isArray(user.following)) {
      isFollowing = user.following.some(followingId => followingId.toString() === asset.createdBy.toString());
    }

    return {
      id: asset._id.toString(),
      type: 'asset',
      title: asset.title,
      description: asset.description,
      tags: asset.tags || [],
      likes: asset.likes || [],
      embeds: asset.embeds || '',
      assetImages: asset.assetImages || [],
      category: asset.category || '',
      subcategory: asset.subcategory || '',
      softwareTools: asset.softwareTools || [],
      createdBy: asset.createdBy,
      profilePicture,
      userName,
      hiring: userSpace?.hiring || '',
      isLyric: false,
      isLiked,
      isCollected,
      isFollowing,
      views: asset.views || 0,
    };
  }

  // If not found in any collections, return null
  return null;
};





/**
 * Get music recommendation by music genre
 * @param {string} genre
 * @returns {Promise<Music>}
 */
const getMusicByGenre = async (filter) => {
  return Music.find(filter);
};


/**
 * Update music by id
 * @param {ObjectId} musicId
 * @param {Object} updateBody
 * @returns {Promise<Music>}
 */
const updateMusic = async (musicId, updateBody) => {
  const music = await Music.findById(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Music not found');
  }

  // Apply updates to the music object
  Object.assign(music, updateBody);

  // Save the updated music document
  await music.save();

  return music;
};


const deleteMusic = async (musicId) => {
  const music = await Music.findByIdAndDelete(musicId);
  if (!music) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Music not found');
  }
  return music;
};


const getMyMusic = async (userId) => {
  const lyricsMusic = await LyricsMusic.find({ createdBy: userId });
  const music = await Music.find({ createdBy: userId }).populate('contributors.userId', 'name email profilePicture');

  let userSpace = null;

  if (userId) {
    userSpace = await UserSpace.findOne({ createdBy: userId });
  }
  
  const userName = userSpace ? `${userSpace.firstName || ''} ${userSpace.lastName || ''}`.trim() : '';
  const profilePicture = userSpace ? userSpace.profilePicture || '' : '';


  const normalizedLyrics = lyricsMusic.map(item => ({
    myRole: item.creationOccupation || [],
    tags: item.tags || [],
    likes: item.likes || [],
    songName: item.lyricName,
    singerName: '',
    publisher: '',
    albumname: '',
    songLanguage: item.lyricLanguage,
    musicUsage: [],
    musicStyle: item.lyricStyle,
    musicMood: item.lyricMood,
    musicInstrument: '',
    description: item.description,
    softwareTool: '',
    musicLyric: item.writeLyric,
    createdBy: item.createdBy,
    profilePicture,  
    userName,
    musicImage: item.musicImage,
    musicAudio: null,
    musicBackground: null,
    comments: [],
    ratings: [],
    id: item._id.toString(),
    isLyric: true
  }));

  const normalizedMusic = music.map(item => {
    const obj = item.toObject();
    
    // Process contributors data
    let contributors = [];
    
    // Always include the original creator as the first contributor
    const originalCreator = {
      userId: obj.createdBy,
      userName: userName,
      profilePicture: profilePicture,
      myRole: obj.myRole || [],
      description: obj.description || '',
      contributionDate: obj.createdAt || new Date()
    };
    
    if (obj.contributors && Array.isArray(obj.contributors) && obj.contributors.length > 0) {
      // Add original creator first
      contributors.push(originalCreator);
      
      // Then add other contributors
      const otherContributors = obj.contributors.map(contributor => ({
        userId: contributor.userId?._id || contributor.userId,
        userName: contributor.userName || (contributor.userId?.name || 'Unknown User'),
        profilePicture: contributor.profilePicture || (contributor.userId?.profilePicture || ''),
        myRole: contributor.myRole || [],
        description: contributor.description || '',
        contributionDate: contributor.contributionDate || contributor.createdAt || new Date()
      }));
      
      contributors.push(...otherContributors);
    } else {
      // Only original creator
      contributors = [originalCreator];
    }
    
    return {
      ...obj,
      id: obj._id.toString(),
      profilePicture,
      userName, 
      isLyric: false,
      contributors
    };
  });

  const combined = [...normalizedLyrics, ...normalizedMusic].sort((a, b) =>
    b.createdBy.toString().localeCompare(a.createdBy.toString())
  );

  return combined;
};

const getAllMusic = async (userId = null) => {
  const lyricsMusic = await LyricsMusic.find();
  const music = await Music.find().populate('contributors.userId', 'name email profilePicture');

  // Get blockedUsers if userId is provided
  let blockedUsers = [];
  if (userId) {
    const user = await User.findById(userId).select('blockedUsers');
    if (user && Array.isArray(user.blockedUsers)) {
      blockedUsers = user.blockedUsers.map(id => id.toString());
    }
  }

  // Collect all unique createdBy user IDs from both sources
  const allUserIds = [
    ...new Set([
      ...lyricsMusic.map(item => item.createdBy),
      ...music.map(item => item.createdBy)
    ])
  ];

  // Fetch all UserSpace documents for these user IDs
  const userSpaces = await UserSpace.find({ createdBy: { $in: allUserIds } }).lean();

  // Create a lookup map of userId -> user info from UserSpace
  const userMap = {};
  userSpaces.forEach(user => {
    userMap[user.createdBy] = {
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      profilePicture: user.profilePicture || '',
      creationOccupation: user.creationOccupation,
      userCountry: (user.address || '').split(',')[0] || ''
    };
  });

  // Ambil likes langsung dari data asli (music dan lyricsMusic)
  const normalizedLyrics = lyricsMusic
    .filter(item => !blockedUsers.includes(item.createdBy.toString()))
    .map(item => {
      const userInfo = userMap[item.createdBy] || {};
      let isLiked = false;
      if (userId) {
        isLiked = (item.likes || []).some(id => id.toString() === userId.toString());
      }
      return {
        ...item.toObject(),
        id: item._id.toString(),
        userName: userInfo.userName || '',
        profilePicture: userInfo.profilePicture || '',
        myRole: userInfo.creationOccupation || [],
        userCountry: (userInfo.address || '').split(',')[0] || '',
        isLyric: true,
        songName: item.lyricName,
        isLiked
      };
    });

  const normalizedMusic = music
    .filter(item => !blockedUsers.includes(item.createdBy.toString()))
    .map(item => {
      const userInfo = userMap[item.createdBy] || {};
      let isLiked = false;
      if (userId) {
        isLiked = (item.likes || []).includes(userId);
      }
      const obj = item.toObject();
      
      // Process contributors data
      let contributors = [];
      
      // Always include the original creator as the first contributor
      const originalCreator = {
        userId: obj.createdBy,
        userName: userInfo.userName || '',
        profilePicture: userInfo.profilePicture || '',
        myRole: obj.myRole || [],
        description: obj.description || '',
        contributionDate: obj.createdAt || new Date()
      };
      
      if (obj.contributors && Array.isArray(obj.contributors) && obj.contributors.length > 0) {
        // Add original creator first
        contributors.push(originalCreator);
        
        // Then add other contributors
        const otherContributors = obj.contributors
          .filter(contributor => contributor.userId) // Filter out null/undefined userIds
          .map(contributor => ({
            userId: contributor.userId?._id || contributor.userId,
          userName: contributor.userName || (contributor.userId?.name || 'Unknown User'),
          profilePicture: contributor.profilePicture || (contributor.userId?.profilePicture || ''),
          myRole: contributor.myRole || [],
          description: contributor.description || '',
          contributionDate: contributor.contributionDate || contributor.createdAt || new Date()
        }));
        
        contributors.push(...otherContributors);
      } else {
        // Only original creator
        contributors = [originalCreator];
      }
      
      return {
        ...obj,
        id: obj._id.toString(),
        userName: userInfo.userName || '',
        profilePicture: userInfo.profilePicture || '',
        userCountry: userInfo.userCountry || '',
        isLyric: false,
        isLiked,
        contributors
      };
    });

  const combined = [...normalizedLyrics, ...normalizedMusic].sort((a, b) =>
    b.createdBy.toString().localeCompare(a.createdBy.toString())
  );

  return combined;
};

/**
 * Get liked music for a user (same response as getMyMusic, tapi enrich profile creator)
 * @param {string} userId
 * @returns {Promise<Array>}
 */
const getLikedMusic = async (userId) => {
  // Ambil user dan daftar likedSongs
  const user = await User.findById(userId).lean();
  if (!user || !user.likedSongs || user.likedSongs.length === 0) return [];

  // Ambil semua data Music yang di-like
  const music = await Music.find({ _id: { $in: user.likedSongs } });

  // Ambil semua userId creator dari lagu yang di-like
  const creatorIds = [...new Set(music.map(item => item.createdBy))];
  const userSpaces = await UserSpace.find({ createdBy: { $in: creatorIds } }).lean();
  const userMap = {};
  userSpaces.forEach(user => {
    userMap[user.createdBy] = {
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      profilePicture: user.profilePicture || ''
    };
  });

  // Normalisasi hasil agar sama dengan getMyMusic
  const normalizedMusic = music.map(item => {
    const obj = item.toObject();
    const userInfo = userMap[obj.createdBy] || {};
    return {
      ...obj,
      id: obj._id.toString(),
      userName: userInfo.userName || '',
      profilePicture: userInfo.profilePicture || '',
      isLyric: false
    };
  });

  return normalizedMusic;
};

const getMyCollections = async (userId) => {
  // Fetch user and their collections
  const user = await User.findById(userId).lean();
  if (!user || !user.collections || user.collections.length === 0) return [];

  // Return just the collection IDs as strings
  return user.collections.map(id => id.toString());
};

const getMyFollowing = async (userId) => {
  // Ambil user dan daftar following
  const user = await User.findById(userId).lean();
  if (!user || !user.following || user.following.length === 0) return [];

  // Ambil semua data user yang diikuti
  const followingUsers = await User.find({ _id: { $in: user.following } }).select('name email');

  // Ambil semua userId creator dari user yang diikuti
  const creatorIds = [...new Set(followingUsers.map(item => item._id))];
  const userSpaces = await UserSpace.find({ createdBy: { $in: creatorIds } }).lean();
  const userMap = {};
  userSpaces.forEach(user => {
    userMap[user.createdBy] = {
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      profilePicture: user.profilePicture || '',
      myRole: user.creationOccupation || [],
      address: user.address || ''
    };
  });

  // Normalisasi hasil agar sama dengan getMyMusic
  const normalizedFollowing = followingUsers.map(item => {
    const userInfo = userMap[item._id] || {};
    return {
      id: item._id.toString(),
      userName: userInfo.userName || '',
      profilePicture: userInfo.profilePicture || '',
      myRole: userInfo.myRole || [],
      address: (userInfo.address || '').split(',')[0] || '',
    };
  });

  return normalizedFollowing;
};

/**
 * Get all music/lyrics/assets from users that the current user is following
 * @param {string} userId
 * @returns {Promise<Array>}
 */
const getAllMusicFollowing = async (userId) => {
  if (!userId) return [];
  const user = await User.findById(userId).select('following').lean();
  if (!user || !user.following || user.following.length === 0) return [];

  // Get all music and lyrics created by followed users
  const music = await Music.find({ createdBy: { $in: user.following } }).populate('contributors.userId', 'name email profilePicture');
  const lyricsMusic = await LyricsMusic.find({ createdBy: { $in: user.following } });

  // Collect all unique createdBy user IDs from both sources
  const allUserIds = [
    ...new Set([
      ...lyricsMusic.map(item => item.createdBy),
      ...music.map(item => item.createdBy)
    ])
  ];
  const userSpaces = await UserSpace.find({ createdBy: { $in: allUserIds } }).lean();
  const userMap = {};
  userSpaces.forEach(user => {
    userMap[user.createdBy] = {
      userName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      profilePicture: user.profilePicture || '',
      creationOccupation: user.creationOccupation,
      userCountry: user.address || ''
    };
  });
  const normalizedLyrics = lyricsMusic.map(item => {
    const userInfo = userMap[item.createdBy] || {};
    let isLiked = false;
    isLiked = (item.likes || []).some(id => id.toString() === userId.toString());
    return {
      ...item.toObject(),
      id: item._id.toString(),
      userName: userInfo.userName || '',
      profilePicture: userInfo.profilePicture || '',
      myRole: userInfo.creationOccupation || [],
      userCountry: userInfo.userCountry || '',
      isLyric: true,
      songName: item.lyricName,
      isLiked
    };
  });
  const normalizedMusic = music.map(item => {
    const userInfo = userMap[item.createdBy] || {};
    let isLiked = false;
    isLiked = (item.likes || []).includes(userId);
    const obj = item.toObject();
    
      // Process contributors data
      let contributors = [];
      
      // Always include the original creator as the first contributor
      const originalCreator = {
        userId: obj.createdBy,
        userName: userInfo.userName || '',
        profilePicture: userInfo.profilePicture || '',
        myRole: obj.myRole || [],
        description: obj.description || '',
        contributionDate: obj.createdAt || new Date()
      };
      
      if (obj.contributors && Array.isArray(obj.contributors) && obj.contributors.length > 0) {
        // Add original creator first
        contributors.push(originalCreator);
        
        // Then add other contributors
        const otherContributors = obj.contributors
          .filter(contributor => contributor.userId) // Filter out null/undefined userIds
          .map(contributor => ({
            userId: contributor.userId?._id || contributor.userId,
          userName: contributor.userName || (contributor.userId?.name || 'Unknown User'),
          profilePicture: contributor.profilePicture || (contributor.userId?.profilePicture || ''),
          myRole: contributor.myRole || [],
          description: contributor.description || '',
          contributionDate: contributor.contributionDate || contributor.createdAt || new Date()
        }));
        
        contributors.push(...otherContributors);
      } else {
        // Only original creator
        contributors = [originalCreator];
      }
    
    return {
      ...obj,
      id: obj._id.toString(),
      userName: userInfo.userName || '',
      profilePicture: userInfo.profilePicture || '',
      userCountry: userInfo.userCountry || '',
      isLyric: false,
      isLiked,
      contributors
    };
  });
  const combined = [...normalizedLyrics, ...normalizedMusic].sort((a, b) =>
    b.createdBy.toString().localeCompare(a.createdBy.toString())
  );
  return combined;
};

module.exports = {
  uploadMusic,
  uploadLyrics,
  queryMusicBox,
  getMusicById,
  getMusicByGenre,
  updateMusic,
  deleteMusic,
  getMyMusic,
  getMyFollowing,
  getAllMusic,
  getMyCollections,
  getAllMusicFollowing,
  getAllContributionsForSong
};
