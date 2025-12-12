const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const Groq = require('groq-sdk');
const config = require('../config/config');

// Initialize Groq
const groq = new Groq({
  apiKey: config.groq.apiKey
});

/**
 * Generate AI-powered autofill for tags and description
 * @route POST /v1/ai/autofill
 * @access Private
 */
const generateAutofill = catchAsync(async (req, res) => {
  const { title, category, subcategory, workImages, contextHint } = req.body;

  // Build professional prompt for freelancer platform
  let prompt = `You are an expert creative professional writing a compelling portfolio piece description for a freelance marketplace platform.

Project Title: ${title}
Category: ${category || 'Creative Services'}
Subcategory: ${subcategory || 'Professional Work'}`;

  // Add context hint if provided
  if (contextHint && contextHint.trim()) {
    prompt += `\nAdditional Context: ${contextHint}`;
  }

  prompt += `

Your task is to analyze this creative work and generate:

1. TAGS (6-8 highly specific, searchable keywords):
   - Use professional industry terminology
   - Include style descriptors (e.g., "minimalist", "contemporary", "brutalist")
   - Add technical skills showcased (e.g., "adobe photoshop", "3d modeling", "responsive design")
   - Include relevant methodologies (e.g., "user-centered design", "agile workflow")
   - Add market-relevant terms that clients search for
   - All tags must be lowercase, precise, and SEO-optimized

2. DESCRIPTION (150-300 characters):
   - Write in a professional, confident tone that appeals to potential clients
   - Lead with the project's unique value proposition and key achievements
   - Highlight technical expertise, creative approach, and problem-solving aspects
   - Mention deliverables, methodologies, or notable features
   - Use industry-standard terminology for architecture, design, and creative fields
   - Focus on outcomes, innovation, and professional quality
   - Make it compelling enough to attract high-value freelance clients
   - Emphasize uniqueness and competitive advantages

Context: This is for a premium freelancer platform where professionals showcase their best work in architecture, graphic design, UI/UX, branding, illustration, 3D design, and creative services. The description should position the creator as a skilled professional worth hiring.

Return ONLY valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "description": "Compelling professional description that sells the work and expertise..."
}`;

  // Log request
  console.log(`AI Autofill Request - User: ${req.user.id}, Title: ${title}`);

  const startTime = Date.now();

  try {
    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [
        {
          role: "system",
          content: "You are an expert creative director and copywriter specializing in portfolio curation for top-tier freelance platforms. You craft compelling, professional descriptions that highlight technical excellence, creative innovation, and market value. You understand architecture, design systems, branding strategy, UX principles, and creative best practices. Your descriptions are concise yet impactful, using industry-standard terminology that resonates with both clients and fellow professionals. You always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: config.groq.temperature,
      max_tokens: config.groq.maxTokens,
      response_format: { type: "json_object" }
    });

    const responseTime = Date.now() - startTime;

    // Parse response
    const result = JSON.parse(completion.choices[0].message.content);

    // Validate output - adjusted for longer descriptions
    if (!result.tags || !Array.isArray(result.tags) || result.tags.length < 5) {
      throw new Error('Invalid AI response: insufficient tags');
    }

    if (!result.description || result.description.length < 100) {
      throw new Error('Invalid AI response: description too short (minimum 100 characters)');
    }

    if (result.description.length > 500) {
      // Trim if too long but keep it professional
      result.description = result.description.substring(0, 497) + '...';
    }

    // Ensure tags are lowercase and trimmed
    const cleanTags = result.tags
      .slice(0, 8) // Max 8 tags
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0);

    // Trim description
    const cleanDescription = result.description.trim();

    // Log success
    console.log(`AI Autofill Success - User: ${req.user.id}, Response Time: ${responseTime}ms`);

    // Optional: Log tokens for monitoring (Groq is free)
    console.log(`Groq API - Tokens: ${completion.usage.total_tokens}, Model: ${config.groq.model}`);

    return res.status(httpStatus.OK).json({
      success: true,
      tags: cleanTags,
      description: cleanDescription
    });

  } catch (error) {
    console.error('AI Autofill Error:', error);

    // Handle Groq API errors
    if (error.code === 'rate_limit_exceeded' || error.status === 429) {
      return res.status(httpStatus.TOO_MANY_REQUESTS).json({
        success: false,
        message: 'API rate limit exceeded. Please try again later.',
        error: 'API_RATE_LIMIT'
      });
    }

    if (error.code === 'invalid_api_key' || error.status === 401) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server configuration error',
        error: 'CONFIGURATION_ERROR'
      });
    }

    if (error.message && error.message.includes('Invalid AI response')) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to generate valid autofill data',
        error: 'INVALID_AI_RESPONSE'
      });
    }

    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate autofill',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

module.exports = {
  generateAutofill
};
