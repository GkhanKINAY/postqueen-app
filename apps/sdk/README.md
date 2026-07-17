# PostQueen NodeJS SDK

This is the NodeJS SDK for [PostQueen](https://postqueen.ai).

You can start by installing the package:

```bash
npm install @postqueen/node
```

## Usage
```typescript
import PostQueen from '@postqueen/node';
const postqueen = new PostQueen('your api key', 'your self-hosted instance (optional)');
```

The available methods are:
- `post(posts: CreatePostDto)` - Schedule a post to PostQueen
- `postList(filters: GetPostsDto)` - Get a list of posts
- `upload(file: Buffer, extension: string)` - Upload a file to PostQueen
- `integrations()` - Get a list of connected channels
- `deletePost(id: string)` - Delete a post by ID

Alternatively you can use the SDK with curl, check the [PostQueen API documentation](https://docs.postqueen.ai/public-api) for more information.