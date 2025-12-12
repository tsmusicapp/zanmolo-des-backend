const Music = require('../models/music.model');
const User = require('../models/user.model');

// Cosine Similarity function
const cosineSimilarity = (userRatingsA, userRatingsB) => {
  const commonSongs = Object.keys(userRatingsA).filter((song) => userRatingsB[song]);
  
  if (commonSongs.length === 0) return 0; // No common songs to compare

  const dotProduct = commonSongs.reduce((sum, song) => sum + (userRatingsA[song] * userRatingsB[song]), 0);
  const normA = Math.sqrt(commonSongs.reduce((sum, song) => sum + userRatingsA[song] ** 2, 0));
  const normB = Math.sqrt(commonSongs.reduce((sum, song) => sum + userRatingsB[song] ** 2, 0));

  return dotProduct / (normA * normB);
};

// Fetch user ratings and other users' ratings
const getUserRatings = async (userId) => {
  const musicList = await Music.find({ 'ratings.userId': userId }).populate('ratings.userId', 'username');
  const userRatings = {};

  musicList.forEach((music) => {
    music.ratings.forEach((rating) => {
      if (rating.userId.toString() === userId) {
        userRatings[music._id] = rating.rating;
      }
    });
  });

  return userRatings;
};

// Generate recommendations for the user
const generateRecommendations = async (userId) => {
  const userRatings = await getUserRatings(userId);
  const allUsers = await User.find();  // Get all users for calculating similarity
  const userSimilarities = [];

  // Step 1: Calculate similarity between the user and all other users
  for (const user of allUsers) {
    if (user._id.toString() !== userId) {
      const otherUserRatings = await getUserRatings(user._id);
      const similarity = cosineSimilarity(userRatings, otherUserRatings);
      userSimilarities.push({ userId: user._id, similarity });
    }
  }

  // Step 2: Sort similar users by similarity score (descending)
  userSimilarities.sort((a, b) => b.similarity - a.similarity);

  // Step 3: Generate song recommendations based on similar users' ratings
  const recommendedSongs = {};
  for (const similarUser of userSimilarities) {
    const otherUserRatings = await getUserRatings(similarUser.userId);
    
    for (const [songId, rating] of Object.entries(otherUserRatings)) {
      if (!userRatings[songId] && rating >= 4) {  // Recommend songs the user hasn't rated yet and have good ratings
        recommendedSongs[songId] = (recommendedSongs[songId] || 0) + similarUser.similarity * rating;
      }
    }
  }

  // Step 4: Sort recommended songs based on recommendation score
  const sortedRecommendations = Object.entries(recommendedSongs)
    .sort((a, b) => b[1] - a[1])
    .map(([songId]) => songId);

  return sortedRecommendations;
};

// Example usage to generate recommendations for a user
const getRecommendations = async (req, res) => {

  console.log('get recommendations:');
  try {
    const recommendations = await generateRecommendations(req.user.id);
    const recommendedSongs = await Music.find({ '_id': { $in: recommendations } });
    
    res.status(200).json(recommendedSongs);
  } catch (error) {
    res.status(500).send({ message: 'Failed to generate recommendations' });
  }
};

module.exports = {
  generateRecommendations,
  getRecommendations
};
