const Category = require("../models/Category");

function getDuplicateMessage(error) {
  if (error?.code !== 11000) {
    return null;
  }
  return "Category already exists";
}

const { parsePagination, buildPagination } = require("../utils/pagination");

exports.getCategories = async (req, res) => {
  try {
    const pagination = parsePagination(req, { defaultLimit: 50, maxLimit: 200 });
    const filter = { isActive: true };

    const [categories, total] = await Promise.all([
      Category.find(filter)
        .populate("parent", "name slug")
        .sort({ name: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Category.countDocuments(filter),
    ]);

    res.json({
      message: "Get categories successfully",
      categories,
      pagination: buildPagination(total, pagination.page, pagination.limit),
    });
  } catch (error) {
    res.status(500).json({ message: "Cannot get categories", error: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findOne({
      $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }, { slug: req.params.id }],
      isActive: true,
    }).populate("parent", "name slug");

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Get category successfully", category });
  } catch (error) {
    res.status(500).json({ message: "Cannot get category", error: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, parent, slug } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const category = await Category.create({
      name: name.trim(),
      description: description || "",
      parent: parent || null,
      slug,
    });

    res.status(201).json({ message: "Create category successfully", category });
  } catch (error) {
    const duplicateMessage = getDuplicateMessage(error);
    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }
    res.status(500).json({ message: "Cannot create category", error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const { name, description, parent, slug, isActive } = req.body;

    if (name !== undefined) {
      if (!name || !name.trim()) {
        return res.status(400).json({ message: "Category name is invalid" });
      }
      category.name = name.trim();
    }

    if (description !== undefined) category.description = description;
    if (parent !== undefined) category.parent = parent || null;
    if (slug !== undefined) category.slug = slug;
    if (isActive !== undefined) category.isActive = Boolean(isActive);

    await category.save();

    res.json({ message: "Update category successfully", category });
  } catch (error) {
    const duplicateMessage = getDuplicateMessage(error);
    if (duplicateMessage) {
      return res.status(400).json({ message: duplicateMessage });
    }
    res.status(500).json({ message: "Cannot update category", error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    category.isActive = false;
    await category.save();

    res.json({ message: "Delete category successfully" });
  } catch (error) {
    res.status(500).json({ message: "Cannot delete category", error: error.message });
  }
};
