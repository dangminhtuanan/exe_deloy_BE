/**
 * @swagger
 * tags:
 *   - name: Category
 *     description: Manage clothing categories
 *   - name: Product
 *     description: Manage clothing products
 *   - name: Cart
 *     description: Customer shopping cart
 *   - name: Order
 *     description: Online order workflow
 *   - name: Payment
 *     description: Payment records
 *   - name: Review
 *     description: Product reviews
 *   - name: AI
 *     description: AI recommendation and logs
 *
 * components:
 *   schemas:
 *     CategoryInput:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           example: Ao thun
 *         slug:
 *           type: string
 *           example: ao-thun
 *         description:
 *           type: string
 *           example: Cac mau ao thun nam nu
 *         parent:
 *           type: string
 *           nullable: true
 *           example: null
 *     ProductInput:
 *       type: object
 *       required: [name, category, price]
 *       properties:
 *         name:
 *           type: string
 *           example: Ao thun basic cotton
 *         category:
 *           type: string
 *           description: Category id or slug
 *           example: ao-thun
 *         description:
 *           type: string
 *           example: Ao thun cotton form regular
 *         price:
 *           type: number
 *           example: 199000
 *         originalPrice:
 *           type: number
 *           example: 249000
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           example: ["/image/ao-thun-1.jpg"]
 *         brand:
 *           type: string
 *           example: Outfio
 *         material:
 *           type: string
 *           example: Cotton
 *         gender:
 *           type: string
 *           enum: [men, women, unisex, kids]
 *           example: unisex
 *         sizes:
 *           type: array
 *           items:
 *             type: string
 *           example: ["S", "M", "L", "XL"]
 *         colors:
 *           type: array
 *           items:
 *             type: string
 *           example: ["black", "white"]
 *         stock:
 *           type: number
 *           example: 100
 *         isFeatured:
 *           type: boolean
 *           example: true
 *     CartItemInput:
 *       type: object
 *       required: [productId]
 *       properties:
 *         productId:
 *           type: string
 *           example: 662a11111111111111111111
 *         quantity:
 *           type: number
 *           example: 2
 *         size:
 *           type: string
 *           example: M
 *         color:
 *           type: string
 *           example: black
 *     CartQuantityInput:
 *       type: object
 *       required: [quantity]
 *       properties:
 *         quantity:
 *           type: number
 *           example: 3
 *     OrderCreateInput:
 *       type: object
 *       properties:
 *         customerName:
 *           type: string
 *           example: Nguyen Van A
 *         phone:
 *           type: string
 *           example: "0912345678"
 *         address:
 *           type: string
 *           example: 123 Nguyen Trai, Quan 1, TP HCM
 *         note:
 *           type: string
 *           example: Giao buoi toi
 *         paymentProvider:
 *           type: string
 *           enum: [cod, momo, vnpay, bank_transfer, stripe, paypal, PAYOS]
 *           example: cod
 *         items:
 *           type: array
 *           description: Optional. If omitted, backend creates order from current cart.
 *           items:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *                 example: 662a11111111111111111111
 *               quantity:
 *                 type: number
 *                 example: 1
 *               size:
 *                 type: string
 *                 example: M
 *               color:
 *                 type: string
 *                 example: black
 *     OrderStatusInput:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [pending, confirmed, packing, shipping, completed, cancelled, refunded]
 *           example: confirmed
 *         paymentStatus:
 *           type: string
 *           enum: [unpaid, pending, paid, failed, refunded]
 *           example: pending
 *     PaymentCreateInput:
 *       type: object
 *       required: [orderId]
 *       properties:
 *         orderId:
 *           type: string
 *           example: 662a22222222222222222222
 *         provider:
 *           type: string
 *           enum: [cod, momo, vnpay, bank_transfer, stripe, paypal, PAYOS]
 *           example: cod
 *         transactionNo:
 *           type: string
 *           example: COD-001
 *     PaymentStatusInput:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [PENDING, PAID, CANCELLED, FAILED, REFUNDED]
 *           example: PAID
 *         transactionNo:
 *           type: string
 *           example: TXN-001
 *     ReviewCreateInput:
 *       type: object
 *       required: [productId, rating]
 *       properties:
 *         productId:
 *           type: string
 *           example: 662a11111111111111111111
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           example: 5
 *         comment:
 *           type: string
 *           example: Vai dep, dung size
 *         orderId:
 *           type: string
 *           nullable: true
 *           example: 662a22222222222222222222
 *     ReviewUpdateInput:
 *       type: object
 *       properties:
 *         rating:
 *           type: number
 *           minimum: 1
 *           maximum: 5
 *           example: 4
 *         comment:
 *           type: string
 *           example: Cap nhat danh gia
 *         isVisible:
 *           type: boolean
 *           example: true
 *     AIBehaviorLogInput:
 *       type: object
 *       properties:
 *         productId:
 *           type: string
 *           example: 662a11111111111111111111
 *         action:
 *           type: string
 *           enum: [view, search, add_to_cart, purchase, review, wishlist, chat, other]
 *           example: view
 *         keyword:
 *           type: string
 *           example: ao thun den
 *         metadata:
 *           type: object
 *           example:
 *             page: home
 *     ChatbotLogInput:
 *       type: object
 *       required: [question]
 *       properties:
 *         question:
 *           type: string
 *           example: Shop co ao so mi trang khong?
 *         answer:
 *           type: string
 *           example: Shop dang co nhieu mau ao so mi trang.
 *         intent:
 *           type: string
 *           example: product_search
 *         metadata:
 *           type: object
 *           example:
 *             source: chatbot
 */

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Get active categories
 *     tags: [Category]
 *     responses:
 *       200:
 *         description: Category list
 *   post:
 *     summary: Create category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput'
 *     responses:
 *       201:
 *         description: Category created
 *
 * /categories/{id}:
 *   get:
 *     summary: Get category by id or slug
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category detail
 *   put:
 *     summary: Update category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CategoryInput'
 *     responses:
 *       200:
 *         description: Category updated
 *   delete:
 *     summary: Delete category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category deleted
 */

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get products
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [men, women, unisex, kids]
 *       - in: query
 *         name: size
 *         schema:
 *           type: string
 *       - in: query
 *         name: color
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: inStock
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, price_asc, price_desc, rating, sold]
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Product list
 *   post:
 *     summary: Create product
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       201:
 *         description: Product created
 *
 * /products/{id}:
 *   get:
 *     summary: Get product by id or slug
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product detail
 *   put:
 *     summary: Update product
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProductInput'
 *     responses:
 *       200:
 *         description: Product updated
 *   delete:
 *     summary: Delete product
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted
 */

/**
 * @swagger
 * /cart:
 *   get:
 *     summary: Get current user's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart detail
 *   delete:
 *     summary: Clear cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 *
 * /cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CartItemInput'
 *     responses:
 *       201:
 *         description: Cart item added
 *
 * /cart/items/{id}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CartQuantityInput'
 *     responses:
 *       200:
 *         description: Cart item updated
 *   delete:
 *     summary: Remove cart item
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cart item removed
 */

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Get all orders for staff
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order list
 *   post:
 *     summary: Create order from cart or explicit items
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderCreateInput'
 *     responses:
 *       201:
 *         description: Order created
 *
 * /orders/my:
 *   get:
 *     summary: Get current user's orders
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My order list
 *
 * /orders/{id}:
 *   get:
 *     summary: Get order detail
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order detail
 *
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status for staff
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderStatusInput'
 *     responses:
 *       200:
 *         description: Order updated
 *
 * /orders/{id}/cancel:
 *   patch:
 *     summary: Cancel current user's order
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order cancelled
 * 
  * /orders/checkout:
 *   post:
 *     summary: Create PayOS checkout URL
 *     description: Create an order from current user's cart and generate a PayOS payment link.
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerName:
 *                 type: string
 *                 example: Nguyen Van A
 *               phone:
 *                 type: string
 *                 example: "0901234567"
 *               email:
 *                 type: string
 *                 example: nguyenvana@gmail.com
 *               address:
 *                 type: string
 *                 example: Ho Chi Minh City
 *               note:
 *                 type: string
 *                 example: Giao hàng giờ hành chính
 *     responses:
 *       201:
 *         description: PayOS checkout created successfully
 *
 * /orders/payment-status/{orderCode}:
 *   get:
 *     summary: Reconcile and get payment status by PayOS order code
 *     tags: [Order]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderCode
 *         required: true
 *         schema:
 *           type: integer
 *           example: 17486123456789
 *     responses:
 *       200:
 *         description: Payment status retrieved successfully
 */

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: Get all payments for staff
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment list
 *   post:
 *     summary: Create payment record
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentCreateInput'
 *     responses:
 *       201:
 *         description: Payment created
 *
 * /payments/my:
 *   get:
 *     summary: Get current user's payments
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: My payment list
 *
 * /payments/{id}:
 *   get:
 *     summary: Get payment detail
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment detail
 *
 * /payments/{id}/status:
 *   patch:
 *     summary: Update payment status for staff
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentStatusInput'
 *     responses:
 *       200:
 *         description: Payment updated
 */

/**
 * @swagger
 * /reviews/product/{productId}:
 *   get:
 *     summary: Get product reviews
 *     tags: [Review]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review list
 *
 * /reviews:
 *   post:
 *     summary: Create product review
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewCreateInput'
 *     responses:
 *       201:
 *         description: Review created
 *
 * /reviews/{id}:
 *   put:
 *     summary: Update review
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewUpdateInput'
 *     responses:
 *       200:
 *         description: Review updated
 *   delete:
 *     summary: Delete review
 *     tags: [Review]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review deleted
 */

/**
 * @swagger
 * /ai/recommendations:
 *   get:
 *     summary: Get recommended products
 *     tags: [AI]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Recommended products
 *
 * /ai/behavior-logs:
 *   get:
 *     summary: Get behavior logs for staff
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Behavior logs
 *   post:
 *     summary: Create behavior log
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AIBehaviorLogInput'
 *     responses:
 *       201:
 *         description: Behavior log created
 *
 * /ai/chatbot-logs:
 *   get:
 *     summary: Get chatbot logs for staff
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chatbot logs
 *   post:
 *     summary: Create chatbot log
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChatbotLogInput'
 *     responses:
 *       201:
 *         description: Chatbot log created
 */
