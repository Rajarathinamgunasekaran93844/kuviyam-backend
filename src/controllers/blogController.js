const { withPrisma } = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const memoryBlogs = [];
let nextMemoryBlogId = 1;

const now = () => new Date().toISOString();

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const cleanText = (value) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeBoolean = (value) => value === true || value === "true";

const sortNewestFirst = (blogs) =>
  [...blogs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const findMemoryBlogBySlug = (slug) =>
  memoryBlogs.find((blog) => blog.slug === slug);

const findMemoryBlogById = (id) =>
  memoryBlogs.find((blog) => blog.id === id);

const ensureUniqueSlug = async (title, currentBlogId, findBySlug) => {
  const baseSlug = generateSlug(title);

  if (!baseSlug) {
    throw new ApiError(400, "Title must contain letters or numbers.");
  }

  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingBlog = await findBySlug(slug);

    if (!existingBlog || existingBlog.id === currentBlogId) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
};

const dbFindBySlug = (db) => (slug) =>
  db.blog.findUnique({
    where: { slug },
  });

const memoryFindBySlug = async (slug) => findMemoryBlogBySlug(slug);

const buildCreateData = async (req, findBySlug) => {
  const title = cleanText(req.body.title);
  const content = cleanText(req.body.content);

  if (!title || !content) {
    throw new ApiError(400, "Title and content are required.");
  }

  return {
    title,
    slug: await ensureUniqueSlug(title, null, findBySlug),
    excerpt: cleanText(req.body.excerpt),
    content,
    imageUrl: cleanText(req.body.imageUrl),
    author: cleanText(req.body.author) || req.user?.name || "Kuviyam Publications",
    isPublished: normalizeBoolean(req.body.isPublished),
  };
};

const createMemoryBlog = (data) => {
  const timestamp = now();
  const blog = {
    id: `memory-blog-${nextMemoryBlogId}`,
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  nextMemoryBlogId += 1;
  memoryBlogs.push(blog);

  return blog;
};

// CREATE BLOG
const createBlog = asyncHandler(async (req, res) => {
  const blog = await withPrisma(
    async (db) =>
      db.blog.create({
        data: await buildCreateData(req, dbFindBySlug(db)),
      }),
    async () => createMemoryBlog(await buildCreateData(req, memoryFindBySlug))
  );

  res.status(201).json({
    success: true,
    data: blog,
  });
});

// ADMIN - GET ALL BLOGS
const getAllBlogsAdmin = asyncHandler(async (req, res) => {
  const blogs = await withPrisma(
    async (db) =>
      db.blog.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
    async () => sortNewestFirst(memoryBlogs)
  );

  res.status(200).json({
    success: true,
    data: blogs,
  });
});

// PUBLIC - GET PUBLISHED BLOGS
const getPublishedBlogs = asyncHandler(async (req, res) => {
  const blogs = await withPrisma(
    async (db) =>
      db.blog.findMany({
        where: {
          isPublished: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    async () => sortNewestFirst(memoryBlogs.filter((blog) => blog.isPublished))
  );

  res.status(200).json({
    success: true,
    data: blogs,
  });
});

// GET BLOG BY SLUG
const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  const blog = await withPrisma(
    async (db) =>
      db.blog.findFirst({
        where: {
          slug,
          isPublished: true,
        },
      }),
    async () => {
      const memoryBlog = findMemoryBlogBySlug(slug);
      return memoryBlog?.isPublished ? memoryBlog : null;
    }
  );

  if (!blog) {
    throw new ApiError(404, "Blog not found.");
  }

  res.status(200).json({
    success: true,
    data: blog,
  });
});

const buildBlogUpdateData = async (body, currentBlog, findBySlug) => {
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = cleanText(body.title);

    if (!title) {
      throw new ApiError(400, "Title is required.");
    }

    data.title = title;
    data.slug = await ensureUniqueSlug(title, currentBlog.id, findBySlug);
  }

  if (Object.prototype.hasOwnProperty.call(body, "content")) {
    const content = cleanText(body.content);

    if (!content) {
      throw new ApiError(400, "Content is required.");
    }

    data.content = content;
  }

  ["excerpt", "imageUrl", "author"].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      data[field] = cleanText(body[field]);
    }
  });

  if (Object.prototype.hasOwnProperty.call(body, "isPublished")) {
    data.isPublished = normalizeBoolean(body.isPublished);
  }

  return data;
};

// UPDATE BLOG
const updateBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const blog = await withPrisma(
    async (db) => {
      const currentBlog = await db.blog.findUnique({
        where: { id },
      });

      if (!currentBlog) {
        throw new ApiError(404, "Blog not found.");
      }

      const data = await buildBlogUpdateData(req.body, currentBlog, dbFindBySlug(db));

      if (Object.keys(data).length === 0) {
        throw new ApiError(400, "No valid blog fields were provided.");
      }

      return db.blog.update({
        where: { id },
        data,
      });
    },
    async () => {
      const currentBlog = findMemoryBlogById(id);

      if (!currentBlog) {
        throw new ApiError(404, "Blog not found.");
      }

      const data = await buildBlogUpdateData(req.body, currentBlog, memoryFindBySlug);

      if (Object.keys(data).length === 0) {
        throw new ApiError(400, "No valid blog fields were provided.");
      }

      Object.assign(currentBlog, data, {
        updatedAt: now(),
      });

      return currentBlog;
    }
  );

  res.status(200).json({
    success: true,
    data: blog,
  });
});

// DELETE BLOG
const deleteBlog = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await withPrisma(
    async (db) => {
      const currentBlog = await db.blog.findUnique({
        where: { id },
      });

      if (!currentBlog) {
        throw new ApiError(404, "Blog not found.");
      }

      await db.blog.delete({
        where: { id },
      });
    },
    async () => {
      const blogIndex = memoryBlogs.findIndex((blog) => blog.id === id);

      if (blogIndex === -1) {
        throw new ApiError(404, "Blog not found.");
      }

      memoryBlogs.splice(blogIndex, 1);
    }
  );

  res.status(200).json({
    success: true,
    message: "Blog deleted successfully.",
  });
});

module.exports = {
  createBlog,
  getAllBlogsAdmin,
  getPublishedBlogs,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
};
