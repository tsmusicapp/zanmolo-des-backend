# Backend Implementation Request: AI Autofill Endpoint

## 📋 Task Overview

Implementasikan endpoint API untuk **AI-powered autofill** yang menggunakan OpenAI GPT untuk generate tags dan description secara otomatis berdasarkan title, category, dan work images.

## 🎯 Requirements

### Endpoint Details

**Method:** `POST`  
**Path:** `/v1/ai/autofill`  
**Authentication:** Required (JWT Bearer Token)

### Request Format

**Headers:**
```
Authorization: Bearer {jwt_token}
Content-Type: application/json
```

**Body:**
```json
{
  "title": "Modern Web Design Homepage",
  "category": "UI/UX Design",
  "subcategory": "Website Design",
  "workImages": [
    "https://example.com/uploads/image1.jpg",
    "https://example.com/uploads/image2.jpg"
  ]
}
```

**Field Descriptions:**
- `title` (required, string): Judul work yang dibuat user (min 3 characters)
- `category` (optional, string): Kategori work
- `subcategory` (optional, string): Subkategori work
- `workImages` (optional, array of strings): Array URL gambar yang sudah diupload

### Response Format

**Success Response (200):**
```json
{
  "success": true,
  "tags": [
    "web design",
    "modern ui",
    "homepage design",
    "responsive layout",
    "clean interface",
    "minimalist",
    "user experience"
  ],
  "description": "A modern and clean web design homepage featuring a responsive layout with intuitive navigation. The design emphasizes user experience through a minimalist approach, incorporating contemporary design trends and best practices for optimal usability."
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Title is required (minimum 3 characters)",
  "error": "VALIDATION_ERROR"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "UNAUTHORIZED"
}
```

**Error Response (429):**
```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again later.",
  "error": "RATE_LIMIT_EXCEEDED"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "message": "Failed to generate autofill",
  "error": "INTERNAL_SERVER_ERROR"
}
```

## 🔧 Implementation Requirements

### 1. OpenAI Integration

- **Model:** GPT-3.5-turbo (recommended untuk cost efficiency) atau GPT-4-turbo (untuk quality)
- **Temperature:** 0.7 (untuk creative tapi consistent results)
- **Max Tokens:** 500-800
- **Response Format:** JSON mode

### 2. AI Prompt Structure

**Untuk text-only input (title + category):**
```
Generate relevant tags and a professional description for a creative work:

Title: {title}
Category: {category}
Subcategory: {subcategory}

Requirements:
- Generate exactly 5-8 relevant, searchable tags
- Tags should be lowercase, specific keywords
- Generate a professional 2-3 sentence description (50-200 characters)
- Description should be engaging and informative
- Focus on design elements, techniques, and target audience

Return valid JSON only:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "description": "Professional description here..."
}
```

**Untuk input dengan images (opsional - jika menggunakan GPT-4 Vision):**
```
Analyze this creative work and generate metadata:

Title: {title}
Category: {category}
Images: [Attached images]

Based on the visual content and title:
1. Generate 5-8 specific tags describing:
   - Design style and aesthetic
   - Visual techniques used
   - Color palette characteristics
   - Target use case

2. Write a professional 2-3 sentence description highlighting:
   - Key visual elements
   - Design approach
   - Intended purpose

Return as JSON:
{
  "tags": ["tag1", "tag2", ...],
  "description": "..."
}
```

### 3. Validation Rules

**Input Validation:**
- `title`: Required, minimum 3 characters, maximum 200 characters
- `category`: Optional, maximum 100 characters
- `subcategory`: Optional, maximum 100 characters
- `workImages`: Optional, array dengan maksimal 10 URLs

**Output Validation:**
- `tags`: Harus return 5-8 tags
- `description`: 50-500 characters
- Sanitize output untuk prevent XSS

### 4. Rate Limiting

**Recommended Limits:**
- **Per User:** 10 requests per hour
- **Per IP:** 20 requests per hour
- **Global:** Monitor untuk cost management

Gunakan Redis atau in-memory cache untuk tracking.

### 5. Error Handling

**Handle semua error cases:**
- Invalid/missing JWT token → 401
- Missing required fields → 400
- OpenAI API errors → 500 dengan retry logic
- Rate limit exceeded → 429
- Network timeout → 503 dengan appropriate message

### 6. Logging

**Log informasi berikut:**
- Request timestamp
- User ID
- Input parameters (title, category)
- Response time
- Success/failure status
- OpenAI API cost (untuk monitoring)

### 7. Security

**Security Requirements:**
- Verify JWT token pada setiap request
- Sanitize input untuk prevent injection attacks
- Validate image URLs (jika ada)
- Rate limiting untuk prevent abuse
- Never expose OpenAI API key
- Content filtering untuk inappropriate content

## 💻 Sample Implementation (Node.js/Express)

```javascript
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Rate limiter
const aiAutofillLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per user
  message: {
    success: false,
    message: 'Rate limit exceeded. Please try again later.',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => req.user.id // Based on authenticated user
});

// Controller
exports.generateAutofill = [
  authMiddleware, // Verify JWT
  aiAutofillLimiter,
  async (req, res) => {
    try {
      const { title, category, subcategory, workImages } = req.body;
      
      // Validation
      if (!title || title.trim().length < 3) {
        return res.status(400).json({
          success: false,
          message: 'Title is required (minimum 3 characters)',
          error: 'VALIDATION_ERROR'
        });
      }
      
      if (title.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'Title is too long (maximum 200 characters)',
          error: 'VALIDATION_ERROR'
        });
      }
      
      // Build prompt
      const prompt = `Generate relevant tags and a professional description for a creative work:

Title: ${title}
Category: ${category || 'Not specified'}
Subcategory: ${subcategory || 'Not specified'}

Requirements:
- Generate exactly 5-8 relevant, searchable tags
- Tags should be lowercase, specific keywords related to design, style, and techniques
- Generate a professional 2-3 sentence description (50-200 characters)
- Description should be engaging, informative, and highlight key aspects
- Focus on visual elements, design approach, and target audience

Return ONLY valid JSON in this exact format:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "description": "Professional description here..."
}`;

      // Log request
      console.log(`AI Autofill Request - User: ${req.user.id}, Title: ${title}`);
      
      const startTime = Date.now();
      
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // or "gpt-4-turbo-preview"
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that generates professional tags and descriptions for creative design works. You always respond with valid JSON only, without any additional text or formatting."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        response_format: { type: "json_object" }
      });
      
      const responseTime = Date.now() - startTime;
      
      // Parse response
      const result = JSON.parse(completion.choices[0].message.content);
      
      // Validate output
      if (!result.tags || !Array.isArray(result.tags) || result.tags.length < 5) {
        throw new Error('Invalid AI response: insufficient tags');
      }
      
      if (!result.description || result.description.length < 50) {
        throw new Error('Invalid AI response: description too short');
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
      
      // Optional: Log cost for monitoring
      const estimatedCost = completion.usage.total_tokens * 0.000002; // Estimate for GPT-3.5
      console.log(`OpenAI Cost: $${estimatedCost.toFixed(6)}`);
      
      return res.status(200).json({
        success: true,
        tags: cleanTags,
        description: cleanDescription
      });
      
    } catch (error) {
      console.error('AI Autofill Error:', error);
      
      // Handle OpenAI specific errors
      if (error.code === 'rate_limit_exceeded') {
        return res.status(429).json({
          success: false,
          message: 'OpenAI rate limit exceeded. Please try again later.',
          error: 'OPENAI_RATE_LIMIT'
        });
      }
      
      if (error.code === 'invalid_api_key') {
        return res.status(500).json({
          success: false,
          message: 'Server configuration error',
          error: 'CONFIGURATION_ERROR'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to generate autofill',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
];

// Route
router.post('/v1/ai/autofill', exports.generateAutofill);
```

## 🧪 Testing

### Test Cases

**1. Valid Request (Title Only):**
```bash
curl -X POST http://localhost:5052/v1/ai/autofill \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Modern Dashboard UI Design"
  }'
```

**Expected:** 200 OK dengan tags dan description

**2. Valid Request (Full Data):**
```bash
curl -X POST http://localhost:5052/v1/ai/autofill \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "E-commerce Mobile App",
    "category": "UI/UX Design",
    "subcategory": "Mobile App Design"
  }'
```

**Expected:** 200 OK dengan tags dan description yang lebih spesifik

**3. Invalid Request (No Title):**
```bash
curl -X POST http://localhost:5052/v1/ai/autofill \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "UI/UX Design"
  }'
```

**Expected:** 400 Bad Request

**4. Unauthorized Request:**
```bash
curl -X POST http://localhost:5052/v1/ai/autofill \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test"
  }'
```

**Expected:** 401 Unauthorized

**5. Rate Limit Test:**
Make 11+ requests dalam 1 jam
**Expected:** 429 Rate Limit Exceeded

## 📊 Monitoring

**Metrics to Track:**
- Request count per hour/day
- Success rate
- Average response time
- OpenAI API costs
- Error rates by type
- Top users by usage

## 🔐 Environment Variables

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...your-key-here...
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_MAX_TOKENS=500
OPENAI_TEMPERATURE=0.7

# Rate Limiting
AI_AUTOFILL_RATE_LIMIT=10
AI_AUTOFILL_WINDOW_MS=3600000

# Feature Flags
AI_AUTOFILL_ENABLED=true
```

## 💰 Cost Estimation

**Per Request (GPT-3.5-turbo):**
- Average tokens: ~400 tokens
- Cost per 1K tokens: $0.002
- **Cost per request: ~$0.0008**

**Monthly Projection (1000 users, 5 requests each):**
- Total requests: 5,000
- **Total cost: ~$4.00/month**

**Monthly Projection (10,000 users, 10 requests each):**
- Total requests: 100,000
- **Total cost: ~$80/month**

**Recommendation:** Start dengan GPT-3.5-turbo, upgrade ke GPT-4 jika diperlukan quality yang lebih baik.

## ✅ Acceptance Criteria

Endpoint dianggap complete jika:

- [ ] Endpoint `/v1/ai/autofill` accessible dan responding
- [ ] JWT authentication berfungsi dengan benar
- [ ] Validation untuk required fields (title min 3 chars)
- [ ] OpenAI integration working dengan GPT-3.5 atau GPT-4
- [ ] Response format sesuai spec (tags array + description string)
- [ ] Rate limiting implemented (10 req/hour per user)
- [ ] Error handling lengkap untuk semua cases
- [ ] Logging untuk monitoring dan debugging
- [ ] Response time < 5 detik (average)
- [ ] Tags count: 5-8 tags
- [ ] Description length: 50-500 characters
- [ ] Tested dengan Postman/cURL dan working

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] OpenAI API key configured di environment
- [ ] Rate limiting tested dan working
- [ ] Error handling tested untuk all scenarios
- [ ] Logging configured untuk monitoring
- [ ] Cost alerts setup untuk OpenAI usage
- [ ] Documentation updated di API docs
- [ ] Frontend team notified bahwa endpoint ready
- [ ] Load testing completed
- [ ] Security review completed

## 📞 Contact

**Questions?**
- Frontend Team: Sudah implement UI dan service layer
- Frontend Docs: `docs/AI_AUTOFILL_BACKEND.md`
- API Contract: See above

**Notes:**
- Frontend sudah ready dan waiting untuk endpoint ini
- Service layer sudah dibuat di frontend side
- UI button sudah implement dan ready to use

---

**Priority:** HIGH  
**Estimated Time:** 4-6 hours  
**Dependencies:** OpenAI API key, JWT auth middleware  
**Status:** ⏳ WAITING FOR IMPLEMENTATION
