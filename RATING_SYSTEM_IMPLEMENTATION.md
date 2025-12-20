# Rating System Implementation Guide

## Overview
This document outlines the complete implementation of the centralized rating and order count system for the Zanmolo platform. The system ensures consistent data across all display locations and provides real-time updates.

## Architecture

### Backend Components

#### 1. RatingService (`src/services/rating.service.js`)
Centralized service handling all rating calculations and updates.

**Key Methods:**
- `calculateUserSellerRating(userId)` - Calculate seller metrics from all user's gigs
- `calculateUserBuyerRating(userId)` - Calculate buyer metrics from completed orders
- `calculateGigMetrics(gigId)` - Recalculate gig rating, reviews, and order counts
- `updateUserMetrics(userId)` - Update cached user metrics
- `getUserRatings(userId)` - Get comprehensive user ratings with caching
- `addReviewToGig(gigId, reviewData)` - Add review and update all related metrics

#### 2. User Model Updates (`src/models/user.model.js`)
Added cached metrics fields for performance:

```javascript
sellerMetrics: {
  averageRating: Number,
  totalReviews: Number,
  totalOrders: Number,
  lastUpdated: Date
},
buyerMetrics: {
  averageRating: Number,
  totalOrders: Number,
  lastUpdated: Date
}
```

#### 3. API Endpoints (`src/routes/v1/rating.route.js`)
- `GET /v1/ratings/user` - Get current user ratings
- `GET /v1/ratings/user/:userId` - Get specific user ratings
- `PUT /v1/ratings/user/update` - Force update current user metrics
- `PUT /v1/ratings/user/:userId/update` - Force update specific user metrics (admin)
- `PUT /v1/ratings/gig/:gigId/update` - Force update gig metrics

#### 4. Updated Controllers
- **OrderController**: Uses RatingService for review additions
- **UserSpaceController**: Uses RatingService with fallback to old calculation
- **RatingController**: New controller for rating-specific endpoints

### Frontend Components

#### 1. Reusable Rating Components

**StarRating** (`src/components/common/StarRating.tsx`)
- Displays star ratings with customizable size and style
- Props: `rating`, `maxRating`, `size`, `showValue`, `className`

**RatingDisplay** (`src/components/common/RatingDisplay.tsx`)
- Comprehensive rating display with multiple variants
- Props: `rating`, `reviewCount`, `orderCount`, `variant`, `size`
- Variants: `compact`, `detailed`, `card`

**UserRatingCard** (`src/components/common/UserRatingCard.tsx`)
- 4-column grid for user profile metrics
- Shows: Likes, Followers, Seller Reviews, Buyer Orders

**ServiceRatingBadge** (`src/components/common/ServiceRatingBadge.tsx`)
- Rating display for service cards and listings
- Props: `rating`, `reviewCount`, `orderCount`, `variant`, `size`
- Variants: `horizontal`, `vertical`

**ServiceCard** (`src/components/common/ServiceCard.tsx`)
- Complete service card component with integrated ratings
- Includes favorite functionality and view counts

#### 2. Rating Service (`src/services/ratingService.ts`)
Frontend service for API communication:
- `getUserRatings(userId?)` - Fetch user ratings
- `updateUserMetrics(userId?)` - Force update user metrics
- `updateGigMetrics(gigId)` - Force update gig metrics
- `addReview(orderId, reviewData)` - Add review with auto-refresh

#### 3. Custom Hook (`src/hooks/useRatingUpdates.ts`)
React hook for rating management:
- Auto-fetching with optional refresh intervals
- Loading and error states
- Convenience methods for adding reviews and updating metrics
- Cached data with real-time updates

## Display Locations

### 1. Service Cards (Service Listings)
**Component**: `ServiceCard` or `ServiceRatingBadge`
**Data Source**: Gig model (`averageRating`, `totalReviews`, `totalOrders`)
**Display**: Horizontal badge with rating, review count, and order count

### 2. Service Detail Page
**Component**: `GigDetailPage` with `RatingDisplay` and `ServiceRatingBadge`
**Data Source**: Gig model with populated reviews
**Display**: 
- Header: ServiceRatingBadge with all metrics
- Reviews section: RatingDisplay with rating and review count
- Individual reviews: StarRating components

### 3. User Profile Page
**Component**: `UserInfo` with `UserRatingCard`
**Data Source**: RatingService API or cached user metrics
**Display**: 4-column grid with Likes, Followers, Seller Rating, Buyer Rating

## Data Flow

### 1. Order Completion Flow
```
Order Status = 'complete' → 
Update Gig.totalOrders → 
RatingService.updateUserMetrics() → 
Cache updated metrics
```

### 2. Review Addition Flow
```
User adds review → 
RatingService.addReviewToGig() → 
Update Gig.reviews array → 
Recalculate Gig.averageRating → 
Update User cached metrics → 
Frontend auto-refreshes
```

### 3. Display Data Flow
```
Frontend Component → 
Check cached metrics (if < 1 hour old) → 
Use cached data OR fetch fresh data → 
Display with fallback values
```

## Performance Optimizations

### 1. Caching Strategy
- User metrics cached for 1 hour
- Automatic cache invalidation on rating changes
- Fallback to real-time calculation if cache miss

### 2. Database Efficiency
- Aggregated calculations reduce query load
- Indexed fields for fast lookups
- Batch updates for multiple metrics

### 3. Frontend Optimization
- Reusable components reduce bundle size
- Optional auto-refresh prevents unnecessary API calls
- Loading states improve user experience

## Usage Examples

### Backend Usage
```javascript
// Add review and update all metrics
await RatingService.addReviewToGig(gigId, {
  buyerId: userId,
  rating: 5,
  comment: "Great service!",
  orderId: orderId
});

// Get comprehensive user ratings
const ratings = await RatingService.getUserRatings(userId);
console.log(ratings.seller.averageRating); // 4.5
console.log(ratings.buyer.totalOrders); // 12
```

### Frontend Usage
```tsx
// Using the rating hook
const { ratings, loading, addReview } = useRatingUpdates({
  userId: currentUserId,
  autoRefresh: true
});

// Display user ratings
<UserRatingCard
  sellerMetrics={ratings?.seller}
  buyerMetrics={ratings?.buyer}
  totalLikes={userLikes}
  followers={userFollowers}
/>

// Display service rating
<ServiceRatingBadge
  rating={gig.averageRating}
  reviewCount={gig.totalReviews}
  orderCount={gig.totalOrders}
  variant="horizontal"
/>
```

## Testing

### Backend Testing
```bash
# Test rating service functions
node test-rating-system.js

# Test API endpoints
curl -X GET "http://localhost:3001/v1/ratings/user" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Frontend Testing
```bash
# Type checking
npx tsc --noEmit

# Component testing
npm run test -- --testPathPattern=rating
```

## Migration Notes

### Existing Data
- Old rating calculations remain as fallbacks
- Gradual migration to cached metrics
- No breaking changes to existing APIs

### Deployment Steps
1. Deploy backend changes first
2. Run database migration for user metrics fields
3. Deploy frontend changes
4. Monitor performance and cache hit rates

## Troubleshooting

### Common Issues
1. **Cache not updating**: Check `lastUpdated` timestamps
2. **Inconsistent ratings**: Force refresh with update endpoints
3. **Performance issues**: Monitor database query patterns

### Debug Endpoints
- `PUT /v1/ratings/user/update` - Force recalculate user metrics
- `PUT /v1/ratings/gig/:gigId/update` - Force recalculate gig metrics

## Future Enhancements

### Planned Features
1. Real-time rating updates via WebSocket
2. Rating analytics and trends
3. Bulk rating recalculation tools
4. Rating system A/B testing

### Scalability Considerations
1. Redis caching for high-traffic scenarios
2. Database sharding for large datasets
3. CDN caching for static rating displays
4. Background job processing for heavy calculations

---

**Implementation Status**: ✅ Complete
**Last Updated**: December 2024
**Version**: 1.0.0