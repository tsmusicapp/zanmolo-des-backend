const Joi = require("joi");
const { objectId } = require("./custom.validation");

const createGig = {
  body: Joi.object()
      .keys({
        title: Joi.string().required().max(80).trim(),
        category: Joi.string().required().valid(
          // Music / Audio
          "music-production",
          "mixing-mastering",
          "songwriting",
          "vocal-recording",
          "beat-making",
          "lyrics-writing",
          "voice-over",
          "podcast-editing",
          "sound-design",
          "jingle-creation",
          "instruments",
          "composition",
          "vocals",
          "audio-engineering",

          // Design categories (MATCH FRONTEND EXACTLY)
          "Architecture Design Services",
          "Interior Design Services",
          "Product & Industrial Design Services",
          "Environment & Scene Design Services",
          "Vehicle & Hard-surface Design Services",
          "Props & Asset Creation Services",
          "3D Visualization & Rendering Services",
          "Animation & Video Design Services",

          "other"
        ),
        subcategory: Joi.string().allow("").optional(),

        description: Joi.string().required().max(1200),
        packages: Joi.object()
          .keys({
            basic: Joi.object()
              .keys({
                title: Joi.string().required().max(50),
                description: Joi.string().required().max(300),
                price: Joi.number().required().min(5).max(10000),
                revisions: Joi.number().required().min(0).max(10),
                features: Joi.array().items(Joi.string().max(100)).default([]),
                duration: Joi.string().allow("").optional(),
                instrument: Joi.string().allow("").optional(),
              })
              .required(),
            standard: Joi.object()
              .keys({
                title: Joi.string().max(50).optional(),
                description: Joi.string().max(300).optional(),
                price: Joi.number().min(5).max(10000).optional(),
                revisions: Joi.number().min(0).max(10).optional(),
                features: Joi.array()
                  .items(Joi.string().max(100))
                  .default([])
                  .optional(),
                duration: Joi.string().allow("").optional(),
                instrument: Joi.string().allow("").optional(),
              })
              .optional(),
            premium: Joi.object()
              .keys({
                title: Joi.string().max(50).optional(),
                description: Joi.string().max(300).optional(),
                price: Joi.number().min(5).max(10000).optional(),
                revisions: Joi.number().min(0).max(10).optional(),
                features: Joi.array()
                  .items(Joi.string().max(100))
                  .default([])
                  .optional(),
                duration: Joi.string().allow("").optional(),
                instrument: Joi.string().allow("").optional(),
              })
              .optional(),
          })
          .required(),
        tags: Joi.array()
          .items(Joi.string().trim().max(30))
          .optional()
          .default([]),
        videos: Joi.array().items(Joi.string()).max(5).optional().default([]),
        images: Joi.array().items(Joi.string()).max(8).optional().default([]),
        coverImageIndex: Joi.number().min(0).optional().default(0),
        referenceSongs: Joi.array()
          .items(Joi.string())
          .max(4)
          .optional()
          .default([]),
        referenceArtworks: Joi.array()
          .items(Joi.string())
          .max(4)
          .optional()
          .default([]),
        videoUrl: Joi.string().uri().allow("").optional(),
        audioSamples: Joi.array()
          .items(
            Joi.object().keys({
              title: Joi.string().required(),
              url: Joi.string().uri().required(),
              duration: Joi.number().min(1),
            })
          )
          .max(3)
          .optional()
          .default([]),
        requirements: Joi.string().max(1000).allow("").optional(),
        aiCustomInstructions: Joi.string().allow("").optional(),
        faq: Joi.array()
          .items(
            Joi.object().keys({
              question: Joi.string().required().max(100),
              answer: Joi.string().required().max(300),
            })
          )
          .max(10)
          .optional()
          .default([]),
        gig_extras: Joi.array()
          .items(
            Joi.object().keys({
              title: Joi.string().required().max(50),
              description: Joi.string().max(100),
              price: Joi.number().required().min(5).max(1000),
              additionalTime: Joi.number().min(0).max(15),
            })
          )
          .max(5)
          .optional()
          .default([]),
        searchKeywords: Joi.array()
          .items(Joi.string().trim())
          .max(10)
          .optional()
          .default([]),
        status: Joi.string()
          .valid("active", "paused", "draft", "under_review")
          .optional()
          .default("draft"),
        isActive: Joi.boolean().optional().default(true),
        // Additional fields for complete database format
        metadata: Joi.object()
          .keys({
            lastModified: Joi.string().isoDate(),
            publishedAt: Joi.string().isoDate(),
            pausedAt: Joi.string().isoDate().allow(null),
          })
          .optional(),
        totalOrders: Joi.number().optional().default(0),
        totalEarnings: Joi.number().optional().default(0),
        averageRating: Joi.number().optional().default(0),
        totalReviews: Joi.number().optional().default(0),
        impressions: Joi.number().optional().default(0),
        clicks: Joi.number().optional().default(0),
        views: Joi.number().optional().default(0),
        favorites: Joi.array().items(Joi.string()).optional().default([]),
        reviews: Joi.array().items(Joi.object()).optional().default([]),
        gigImages: Joi.array().items(Joi.string()).optional().default([]),
        // MongoDB/Mongoose standard fields
        createdAt: Joi.alternatives()
          .try(Joi.date(), Joi.string().isoDate())
          .optional(),
        updatedAt: Joi.alternatives()
          .try(Joi.date(), Joi.string().isoDate())
          .optional(),
        __v: Joi.number().optional().default(0),
      })
      .unknown(true),
};

const updateGig = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      title: Joi.string().max(80).trim(),
      category: Joi.string().valid(
        // Music / Audio
        "music-production",
        "mixing-mastering",
        "songwriting",
        "vocal-recording",
        "beat-making",
        "lyrics-writing",
        "voice-over",
        "podcast-editing",
        "sound-design",
        "jingle-creation",
        "instruments",
        "composition",
        "vocals",
        "audio-engineering",

        // Design categories (MATCH FRONTEND EXACTLY)
        "Architecture Design Services",
        "Interior Design Services",
        "Product & Industrial Design Services",
        "Environment & Scene Design Services",
        "Vehicle & Hard-surface Design Services",
        "Props & Asset Creation Services",
        "3D Visualization & Rendering Services",
        "Animation & Video Design Services",

        "other"
      ),
      subcategory: Joi.string().allow(""),
      description: Joi.string().max(1200),
      packages: Joi.object().keys({
        basic: Joi.object().keys({
          title: Joi.string().max(50),
          description: Joi.string().max(300),
          price: Joi.number().min(5).max(10000),
          revisions: Joi.number().min(0).max(10),
          features: Joi.array().items(Joi.string().max(100)).default([]),
          duration: Joi.string().allow(""),
          instrument: Joi.string().allow(""),
        }),
        standard: Joi.object().keys({
          title: Joi.string().max(50),
          description: Joi.string().max(300),
          price: Joi.number().min(5).max(10000),
          revisions: Joi.number().min(0).max(10),
          features: Joi.array().items(Joi.string().max(100)).default([]),
          duration: Joi.string().allow(""),
          instrument: Joi.string().allow(""),
        }),
        premium: Joi.object().keys({
          title: Joi.string().max(50),
          description: Joi.string().max(300),
          price: Joi.number().min(5).max(10000),
          revisions: Joi.number().min(0).max(10),
          features: Joi.array().items(Joi.string().max(100)).default([]),
          duration: Joi.string().allow(""),
          instrument: Joi.string().allow(""),
        }),
      }),
      tags: Joi.array().items(Joi.string().trim().max(30)).default([]),
      videos: Joi.array().items(Joi.string()).max(5).default([]),
      images: Joi.array().items(Joi.string()).max(8).default([]),
      coverImageIndex: Joi.number().min(0).default(0),
      referenceSongs: Joi.array().items(Joi.string()).max(4).default([]),
      referenceArtworks: Joi.array().items(Joi.string()).max(4).default([]),
      videoUrl: Joi.string().uri().allow(""),
      audioSamples: Joi.array()
        .items(
          Joi.object().keys({
            title: Joi.string().required(),
            url: Joi.string().uri().required(),
            duration: Joi.number().min(1),
          })
        )
        .max(3),
      requirements: Joi.string().max(1000).allow(""),
      aiCustomInstructions: Joi.string().allow(""),
      faq: Joi.array()
        .items(
          Joi.object().keys({
            question: Joi.string().required().max(100),
            answer: Joi.string().required().max(300),
          })
        )
        .max(10),
      gig_extras: Joi.array()
        .items(
          Joi.object().keys({
            title: Joi.string().required().max(50),
            description: Joi.string().max(100),
            price: Joi.number().required().min(5).max(1000),
            additionalTime: Joi.number().min(0).max(15),
          })
        )
        .max(5),
      searchKeywords: Joi.array().items(Joi.string().trim()).max(10),
      status: Joi.string().valid("draft", "active", "paused", "under_review"),
      isActive: Joi.boolean(),
      // Additional fields for complete database format
      metadata: Joi.object()
        .keys({
          lastModified: Joi.string().isoDate(),
          publishedAt: Joi.string().isoDate(),
          pausedAt: Joi.string().isoDate().allow(null),
        })
        .optional(),
      totalOrders: Joi.number().default(0),
      totalEarnings: Joi.number().default(0),
      averageRating: Joi.number().default(0),
      totalReviews: Joi.number().default(0),
      impressions: Joi.number().default(0),
      clicks: Joi.number().default(0),
      views: Joi.number().default(0),
      favorites: Joi.array().items(Joi.string()).default([]),
      reviews: Joi.array().items(Joi.object()).default([]),
      // MongoDB/Mongoose standard fields
      createdAt: Joi.date().optional(),
      updatedAt: Joi.date().optional(),
      __v: Joi.number().default(0),
    })
    .min(1),
};

const getGigs = {
  query: Joi.object().keys({
    category: Joi.string(),
    subcategory: Joi.string(),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    seller: Joi.string().custom(objectId),
    search: Joi.string(),
    country: Joi.string(),
    language: Joi.string(),
    sortBy: Joi.string().valid(
      "newest",
      "oldest",
      "price_low",
      "price_high",
      "rating",
      "popular"
    ),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    status: Joi.string().valid("draft", "active", "paused", "denied"),
  }),
};

const getGig = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
};

const deleteGig = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
};

const updateGigStatus = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .required()
      .valid("draft", "active", "paused", "denied"),
    denialReason: Joi.string().when("status", {
      is: "denied",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }),
};

const addGigReview = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    rating: Joi.number().required().min(1).max(5),
    comment: Joi.string().max(500).allow(""),
    orderId: Joi.string().custom(objectId).required(),
  }),
};

const favoriteGig = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
};

const reportGig = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().required().max(200),
    description: Joi.string().max(500).allow(""),
  }),
};

const getGigsByUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid("draft", "active", "paused", "denied"),
    sortBy: Joi.string().valid("newest", "oldest", "rating", "popular"),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getMyGigs = {
  query: Joi.object().keys({
    status: Joi.string().valid("draft", "active", "paused", "denied"),
    sortBy: Joi.string().valid("newest", "oldest", "rating", "popular"),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
  }),
};

const getGigStats = {
  params: Joi.object().keys({
    gigId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    period: Joi.string().valid("7d", "30d", "90d", "1y").default("30d"),
  }),
};

module.exports = {
  createGig,
  updateGig,
  getGigs,
  getGig,
  deleteGig,
  updateGigStatus,
  addGigReview,
  favoriteGig,
  reportGig,
  getGigsByUser,
  getMyGigs,
  getGigStats,
};
