// INICIALIZACIÓN DE FIREBASE Y CLOUDINARY DESDE CONFIG.JS
let db, auth;

try {
    firebase.initializeApp(CONFIG.FIREBASE);
    db = firebase.firestore();
    auth = firebase.auth();
} catch (e) {
    console.error("Error al inicializar Firebase. Revisa config.js:", e);
}

// ESTADO GLOBAL
let products = [];
let cart = [];
let salesHistory = [];
let currentCategory = 'Todos';
let currentPaymentMethod = 'Efectivo';
let whatsappNumber = '59170000000'; // Tu número de WhatsApp con código de país (591)

// ESCUCHADOR DE ESTADO EN TIEMPO REAL (FIREBASE AUTH)
window.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    // Escuchar si hay sesión iniciada en Firebase
    if (auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                // Hay Administrador Autenticado
                setupAdminView();
            } else {
                // Modo Cliente / No Autenticado
                setupCustomerView();
            }
            loadDataFromFirebase();
        });
    }

    // Listener para subir imagen de producto a Cloudinary
    const prodImageInput = document.getElementById('prod-image-file');
    if (prodImageInput) {
        prodImageInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    document.getElementById('image-preview').src = event.target.result;
                    document.getElementById('image-preview-container').classList.remove('hidden');
                };
                reader.readAsDataURL(file);

                const btn = document.getElementById('save-prod-btn');
                btn.innerText = 'Subiendo a Cloudinary...';
                btn.disabled = true;

                try {
                    const uploadedUrl = await uploadImageToCloudinary(file);
                    document.getElementById('prod-image-url').value = uploadedUrl;
                    btn.innerText = 'Guardar Producto';
                    btn.disabled = false;
                } catch (err) {
                    console.error("Error subiendo imagen:", err);
                    alert("No se pudo subir la imagen a Cloudinary.");
                    btn.innerText = 'Guardar Producto';
                    btn.disabled = false;
                }
            }
        });
    }
});

function updateClock() {
    const now = new Date();
    document.getElementById('current-time').innerText = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
}

// VERIFICACIÓN DE SEGURIDAD: ¿ES ADMIN EN FIREBASE?
function isAdmin() {
    return auth && auth.currentUser !== null;
}

// CONFIGURAR INTERFAZ DE ADMINISTRADOR
function setupAdminView() {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    
    const badge = document.getElementById('user-role-badge');
    if (badge) {
        badge.innerText = `Admin: ${auth.currentUser.email}`;
        badge.className = 'text-[10px] text-roseGold-600 font-bold';
    }
    
    const posLabel = document.getElementById('nav-pos-label');
    if (posLabel) posLabel.innerText = 'Ventas';

    document.getElementById('checkout-btn-text').innerText = 'Cobrar';
    document.getElementById('auth-landing-screen').classList.add('hidden');
    document.getElementById('main-header').classList.remove('hidden');
}

// CONFIGURAR INTERFAZ DE CLIENTE
function setupCustomerView() {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    
    const badge = document.getElementById('user-role-badge');
    if (badge) {
        badge.innerText = 'Modo: Catálogo Cliente';
        badge.className = 'text-[10px] text-emerald-600 font-bold';
    }

    const posLabel = document.getElementById('nav-pos-label');
    if (posLabel) posLabel.innerText = 'Catálogo';

    document.getElementById('checkout-btn-text').innerText = 'Enviar Pedido por WhatsApp';

    // Forzar pestaña de ventas / catálogo únicamente
    switchTab('pos');
}

// INGRESO COMO CLIENTE
function enterAsCustomer() {
    if (auth && auth.currentUser) {
        auth.signOut();
    }
    document.getElementById('auth-landing-screen').classList.add('hidden');
    document.getElementById('main-header').classList.remove('hidden');
    setupCustomerView();
}

// LOGIN ADMIN CON FIREBASE AUTHENTICATION
async function loginAsAdmin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value.trim();

    if (!email || !password) {
        alert('Por favor ingresa tu correo y contraseña.');
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
        alert('¡Bienvenido, Administrador!');
    } catch (error) {
        console.error(error);
        alert('Acceso denegado: ' + translateFirebaseError(error.code));
    }
}

function translateFirebaseError(code) {
    switch (code) {
        case 'auth/user-not-found': return 'El usuario no está registrado.';
        case 'auth/wrong-password': return 'Contraseña incorrecta.';
        case 'auth/invalid-email': return 'El correo electrónico no es válido.';
        case 'auth/invalid-credential': return 'Credenciales inválidas.';
        default: return 'Error al iniciar sesión.';
    }
}

// CERRAR SESIÓN
function logoutSession() {
    if (auth) auth.signOut();
    document.getElementById('admin-email').value = '';
    document.getElementById('admin-password').value = '';
    document.getElementById('auth-landing-screen').classList.remove('hidden');
    document.getElementById('main-header').classList.add('hidden');
}

// CAMBIO DE PESTAÑA CON BLOQUEO DE SEGURIDAD
function switchTab(tabId) {
    if (tabId !== 'pos' && !isAdmin()) {
        alert("🔒 Acceso restringido. Inicia sesión como administrador para acceder.");
        return;
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => {
        el.classList.remove('bg-roseGold-500', 'text-white', 'shadow-sm');
        el.classList.add('text-gray-600', 'hover:text-roseGold-600', 'hover:bg-roseGold-50');
    });

    document.getElementById(`view-${tabId}`).classList.remove('hidden');
    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-600', 'hover:text-roseGold-600', 'hover:bg-roseGold-50');
        activeBtn.classList.add('bg-roseGold-500', 'text-white', 'shadow-sm');
    }

    if (tabId === 'inventory') renderInventoryTable();
    if (tabId === 'history') renderSalesHistory();
    if (tabId === 'dashboard') updateDashboardStats();
}

// SUBIR IMAGEN A CLOUDINARY
async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CONFIG.CLOUDINARY.uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY.cloudName}/image/upload`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    if (data.secure_url) return data.secure_url;
    else throw new Error('Fallo al subir a Cloudinary');
}

// SUBIR Y GUARDAR LOGO DE LA EMPRESA
async function handleCompanyLogoUpload(e) {
    if (!isAdmin()) {
        alert("Solo el administrador puede cambiar el logo.");
        return;
    }
    const file = e.target.files[0];
    if (file) {
        try {
            const logoUrl = await uploadImageToCloudinary(file);
            localStorage.setItem('gg_logo', logoUrl);
            setLogoUI(logoUrl);
            alert('¡Logo actualizado!');
        } catch (err) {
            alert('Error al subir el logo.');
        }
    }
}

function setLogoUI(url) {
    ['company-logo', 'header-logo'].forEach(prefix => {
        const img = document.getElementById(`${prefix}-img`);
        const icon = document.getElementById(`${prefix}-icon`);
        if (img && icon) {
            img.src = url;
            img.classList.remove('hidden');
            icon.classList.add('hidden');
        }
    });
}

// CARGAR DATOS DE FIRESTORE
async function loadDataFromFirebase() {
    if (!db) return;
    try {
        const prodSnapshot = await db.collection('products').get();
        products = [];
        prodSnapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));

        if (isAdmin()) {
            const histSnapshot = await db.collection('salesHistory').orderBy('timestamp', 'desc').get();
            salesHistory = [];
            histSnapshot.forEach(doc => salesHistory.push(doc.data()));
        }

        renderProducts();
        if (isAdmin()) {
            renderInventoryTable();
            renderSalesHistory();
            updateDashboardStats();
        }
    } catch (err) {
        console.error("Error al cargar desde Firestore:", err);
    }
}

// FILTROS Y CATÁLOGO
function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.cat-pill').forEach(btn => {
        btn.classList.remove('bg-roseGold-500', 'text-white', 'shadow-sm');
        btn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-roseGold-100');
    });
    const activeBtn = document.getElementById(`cat-${cat}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-roseGold-100');
        activeBtn.classList.add('bg-roseGold-500', 'text-white', 'shadow-sm');
    }
    renderProducts();
}

function filterProducts() { renderProducts(); }

function renderProducts() {
    const query = document.getElementById('pos-search').value.toLowerCase();
    const grid = document.getElementById('pos-product-grid');
    grid.innerHTML = '';

    const filtered = products.filter(p => {
        const matchCat = currentCategory === 'Todos' || p.category === currentCategory;
        const matchQuery = p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
        return matchCat && matchQuery;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400 text-sm">No hay productos disponibles</div>`;
        return;
    }

    filtered.forEach(p => {
        grid.innerHTML += `
            <div onclick="addToCart('${p.id}')" class="bg-white p-3 rounded-2xl border border-roseGold-100 hover:border-roseGold-400 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group">
                <div>
                    <div class="h-32 rounded-xl bg-gray-100 mb-2 overflow-hidden relative">
                        <img src="${p.image || 'https://via.placeholder.com/300'}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                        <span class="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-0.5 rounded-full text-gray-700">${p.stock} disp.</span>
                    </div>
                    <h4 class="font-semibold text-xs text-gray-800 line-clamp-2">${p.name}</h4>
                    <p class="text-[10px] text-gray-400 mt-0.5">${p.sku}</p>
                </div>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
                    <span class="font-extrabold text-roseGold-600 text-sm">Bs. ${Number(p.price).toFixed(2)}</span>
                    <span class="w-7 h-7 rounded-xl bg-roseGold-50 text-roseGold-600 flex items-center justify-center group-hover:bg-roseGold-500 group-hover:text-white transition-colors">
                        <i class="fa-solid fa-plus text-xs"></i>
                    </span>
                </div>
            </div>
        `;
    });
}

// CARRITO
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock <= 0) {
        alert('Producto agotado.');
        return;
    }

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        if (existing.qty < product.stock) existing.qty++;
        else alert('No hay más stock disponible.');
    } else {
        cart.push({ ...product, qty: 1 });
    }
    renderCart();
}

function updateCartQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    const product = products.find(p => p.id === productId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== productId);
    else if (item.qty > product.stock) { item.qty = product.stock; alert('Stock máximo alcanzado.'); }
    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    renderCart();
}

function clearCart() {
    cart = [];
    document.getElementById('cart-discount').value = 0;
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-count-badge');
    const checkoutBtn = document.getElementById('checkout-btn');

    badge.innerText = `${cart.reduce((sum, i) => sum + i.qty, 0)} items`;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <i class="fa-solid fa-bag-shopping text-4xl mb-3 text-roseGold-200"></i>
                <p class="text-sm font-medium">El carrito está vacío</p>
            </div>
        `;
        checkoutBtn.disabled = true;
        checkoutBtn.classList.add('opacity-50', 'cursor-not-allowed');
        updateCartCalculations();
        return;
    }

    checkoutBtn.disabled = false;
    checkoutBtn.classList.remove('opacity-50', 'cursor-not-allowed');

    container.innerHTML = '';
    cart.forEach(item => {
        container.innerHTML += `
            <div class="py-3 flex items-center justify-between">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <img src="${item.image}" class="w-10 h-10 rounded-xl object-cover flex-shrink-0">
                    <div class="overflow-hidden">
                        <h5 class="font-semibold text-xs text-gray-800 truncate">${item.name}</h5>
                        <p class="text-xs text-roseGold-600 font-bold">Bs. ${(item.price * item.qty).toFixed(2)}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-2 flex-shrink-0">
                    <button onclick="updateCartQty('${item.id}', -1)" class="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-xs"><i class="fa-solid fa-minus"></i></button>
                    <span class="text-xs font-bold w-5 text-center">${item.qty}</span>
                    <button onclick="updateCartQty('${item.id}', 1)" class="w-6 h-6 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-xs"><i class="fa-solid fa-plus"></i></button>
                    <button onclick="removeFromCart('${item.id}')" class="text-gray-300 hover:text-red-500 ml-1"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            </div>
        `;
    });
    updateCartCalculations();
}

function updateCartCalculations() {
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
    const total = Math.max(0, subtotal - discount);

    document.getElementById('cart-subtotal').innerText = `Bs. ${subtotal.toFixed(2)}`;
    document.getElementById('cart-total').innerText = `Bs. ${total.toFixed(2)}`;
    return { subtotal, discount, total };
}

function handleCheckoutAction() {
    if (isAdmin()) {
        openCheckoutModal();
    } else {
        sendOrderToWhatsApp();
    }
}

function sendOrderToWhatsApp() {
    const { subtotal, discount, total } = updateCartCalculations();
    let msg = `*¡Hola! Nuevo Pedido - Glow & Glamour*%0A%0A`;
    cart.forEach(item => {
        msg += `- ${item.name} (x${item.qty}) : Bs. ${(item.price * item.qty).toFixed(2)}%0A`;
    });
    msg += `%0A*Subtotal:* Bs. ${subtotal.toFixed(2)}`;
    if (discount > 0) msg += `%0A*Descuento:* Bs. ${discount.toFixed(2)}`;
    msg += `%0A*TOTAL A PAGAR:* Bs. ${total.toFixed(2)}%0A%0A¡Quedo a la espera de la confirmación!`;

    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank');
}

// PROCESAR COBRO (SOLO ADMIN)
function openCheckoutModal() {
    if (!isAdmin()) return;
    const { total } = updateCartCalculations();
    document.getElementById('modal-total-display').innerText = `Bs. ${total.toFixed(2)}`;
    document.getElementById('cash-tendered').value = '';
    document.getElementById('cash-change').innerText = 'Bs. 0.00';
    document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() { document.getElementById('checkout-modal').classList.add('hidden'); }

function setPaymentMethod(method) {
    currentPaymentMethod = method;
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        btn.classList.remove('border-roseGold-500', 'bg-roseGold-50', 'text-roseGold-700');
        btn.classList.add('border-gray-200', 'bg-white', 'text-gray-600');
    });
    const activeBtn = document.getElementById(`pay-${method.toLowerCase()}`);
    if (activeBtn) {
        activeBtn.classList.remove('border-gray-200', 'bg-white', 'text-gray-600');
        activeBtn.classList.add('border-roseGold-500', 'bg-roseGold-50', 'text-roseGold-700');
    }
    document.getElementById('cash-input-section').style.display = method === 'Efectivo' ? 'block' : 'none';
}

function calculateChange() {
    const { total } = updateCartCalculations();
    const tendered = parseFloat(document.getElementById('cash-tendered').value) || 0;
    document.getElementById('cash-change').innerText = `Bs. ${Math.max(0, tendered - total).toFixed(2)}`;
}

async function processCheckout() {
    if (!isAdmin()) return;

    const { subtotal, discount, total } = updateCartCalculations();
    if (currentPaymentMethod === 'Efectivo') {
        const tendered = parseFloat(document.getElementById('cash-tendered').value) || 0;
        if (tendered < total) { alert('El efectivo recibido es insuficiente.'); return; }
    }

    cart.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        if (p) p.stock -= item.qty;
    });

    const transaction = {
        id: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
        date: new Date().toLocaleString(),
        timestamp: Date.now(),
        items: [...cart],
        paymentMethod: currentPaymentMethod,
        subtotal, discount, total
    };

    salesHistory.unshift(transaction);
    
    if (db) {
        await db.collection('salesHistory').add(transaction);
        for (let item of cart) {
            await db.collection('products').doc(item.id).update({ stock: item.stock });
        }
    }

    closeCheckoutModal();
    clearCart();
    renderProducts();
    renderInventoryTable();
    showReceiptModal(transaction);
}

function showReceiptModal(txn) {
    document.getElementById('rec-id').innerText = txn.id;
    document.getElementById('rec-date').innerText = txn.date;
    document.getElementById('rec-payment').innerText = txn.paymentMethod;
    document.getElementById('rec-subtotal').innerText = `Bs. ${txn.subtotal.toFixed(2)}`;
    document.getElementById('rec-discount').innerText = `Bs. ${txn.discount.toFixed(2)}`;
    document.getElementById('rec-total').innerText = `Bs. ${txn.total.toFixed(2)}`;

    const listContainer = document.getElementById('rec-items-list');
    listContainer.innerHTML = '';
    txn.items.forEach(i => {
        listContainer.innerHTML += `<div class="flex justify-between"><span>${i.qty}x ${i.name}</span><span>Bs. ${(i.price * i.qty).toFixed(2)}</span></div>`;
    });

    document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

// GESTIÓN DE INVENTARIO (SOLO ADMIN)
function renderInventoryTable() {
    if (!isAdmin()) return;
    const query = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = products.filter(p => p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query));

    filtered.forEach(p => {
        const statusBadge = p.stock > 5 
            ? `<span class="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-xs font-semibold">Normal</span>`
            : `<span class="bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full text-xs font-semibold">Stock Bajo</span>`;

        tbody.innerHTML += `
            <tr class="hover:bg-roseGold-50/30 transition-colors border-b border-gray-100">
                <td class="py-3 px-4 flex items-center space-x-3">
                    <img src="${p.image}" class="w-10 h-10 rounded-xl object-cover">
                    <span class="font-semibold text-gray-800">${p.name}</span>
                </td>
                <td class="py-3 px-4 text-gray-500 font-mono text-xs">${p.sku}</td>
                <td class="py-3 px-4 text-gray-600">${p.category}</td>
                <td class="py-3 px-4 text-right font-bold text-gray-900">Bs. ${Number(p.price).toFixed(2)}</td>
                <td class="py-3 px-4 text-center font-semibold">${p.stock}</td>
                <td class="py-3 px-4 text-center">${statusBadge}</td>
                <td class="py-3 px-4 text-center space-x-2">
                    <button onclick="editProduct('${p.id}')" class="text-gray-400 hover:text-roseGold-600 p-1"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteProduct('${p.id}')" class="text-gray-400 hover:text-red-500 p-1"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `;
    });
}

function openProductModal(product = null) {
    if (!isAdmin()) return;
    document.getElementById('product-form').reset();
    document.getElementById('edit-product-id').value = '';
    document.getElementById('prod-image-url').value = '';
    document.getElementById('image-preview-container').classList.add('hidden');

    if (product) {
        document.getElementById('product-modal-title').innerHTML = `<i class="fa-solid fa-pen text-roseGold-600"></i><span>Editar Producto</span>`;
        document.getElementById('edit-product-id').value = product.id;
        document.getElementById('prod-name').value = product.name;
        document.getElementById('prod-sku').value = product.sku;
        document.getElementById('prod-cat').value = product.category;
        document.getElementById('prod-price').value = product.price;
        document.getElementById('prod-stock').value = product.stock;
        document.getElementById('prod-image-url').value = product.image;
        if (product.image) {
            document.getElementById('image-preview').src = product.image;
            document.getElementById('image-preview-container').classList.remove('hidden');
        }
    } else {
        document.getElementById('product-modal-title').innerHTML = `<i class="fa-solid fa-box text-roseGold-600"></i><span>Nuevo Producto</span>`;
    }
    document.getElementById('product-modal').classList.remove('hidden');
}

function closeProductModal() { document.getElementById('product-modal').classList.add('hidden'); }

async function saveProduct(e) {
    e.preventDefault();
    if (!isAdmin()) return;

    const id = document.getElementById('edit-product-id').value;
    const name = document.getElementById('prod-name').value;
    const sku = document.getElementById('prod-sku').value;
    const category = document.getElementById('prod-cat').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const stock = parseInt(document.getElementById('prod-stock').value);
    let image = document.getElementById('prod-image-url').value || 'https://via.placeholder.com/300';

    const productData = { name, sku, category, price, stock, image };

    if (id) {
        const index = products.findIndex(item => item.id == id);
        if (index !== -1) products[index] = { id, ...productData };
        if (db) await db.collection('products').doc(id).update(productData);
    } else {
        if (db) {
            const docRef = await db.collection('products').add(productData);
            products.push({ id: docRef.id, ...productData });
        } else {
            products.push({ id: String(Date.now()), ...productData });
        }
    }

    closeProductModal();
    renderInventoryTable();
    renderProducts();
}

function editProduct(id) {
    if (!isAdmin()) return;
    const p = products.find(item => item.id == id);
    if (p) openProductModal(p);
}

async function deleteProduct(id) {
    if (!isAdmin()) return;
    if (confirm('¿Estás seguro de eliminar este producto?')) {
        products = products.filter(item => item.id != id);
        if (db) await db.collection('products').doc(id).delete();
        renderInventoryTable();
        renderProducts();
    }
}

// EXCEL Y REPORTE
function downloadExcelTemplate() {
    if (!isAdmin()) return;
    const templateData = [
        { Nombre: "Labial Ejemplo", SKU: "LAB-99", Categoria: "Maquillaje", Precio_Bs: 50.00, Stock: 20, Imagen_URL: "https://images.unsplash.com/photo-1586495777744-4413f21062fa" }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla_Productos");
    XLSX.writeFile(workbook, "Plantilla_Catalogo_GlowGlamour.xlsx");
}

async function handleExcelUpload(e) {
    if (!isAdmin()) return;
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            let count = 0;
            for (let row of json) {
                const newProd = {
                    name: row.Nombre || 'Sin Nombre',
                    sku: row.SKU || ('SKU-' + Math.floor(Math.random()*1000)),
                    category: row.Categoria || 'Maquillaje',
                    price: parseFloat(row.Precio_Bs || 10.00),
                    stock: parseInt(row.Stock || 10),
                    image: row.Imagen_URL || 'https://via.placeholder.com/300'
                };
                if (db) {
                    const docRef = await db.collection('products').add(newProd);
                    products.push({ id: docRef.id, ...newProd });
                } else {
                    products.push({ id: String(Date.now() + count), ...newProd });
                }
                count++;
            }

            renderInventoryTable();
            renderProducts();
            alert(`¡Se importaron ${count} productos correctamente!`);
        } catch (err) {
            console.error(err);
            alert('Error al procesar el archivo Excel.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function renderSalesHistory() {
    if (!isAdmin()) return;
    const tbody = document.getElementById('sales-history-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (salesHistory.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-gray-400">No hay ventas registradas</td></tr>`;
        return;
    }

    salesHistory.forEach(txn => {
        const itemsSummary = txn.items.map(i => `${i.qty}x ${i.name}`).join(', ');
        tbody.innerHTML += `
            <tr class="hover:bg-roseGold-50/30 transition-colors border-b border-gray-100">
                <td class="py-3 px-4 font-mono font-semibold text-roseGold-700">${txn.id}</td>
                <td class="py-3 px-4 text-gray-600">${txn.date}</td>
                <td class="py-3 px-4 text-gray-800 truncate max-w-xs">${itemsSummary}</td>
                <td class="py-3 px-4"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs">${txn.paymentMethod}</span></td>
                <td class="py-3 px-4 text-right font-bold text-gray-900">Bs. ${Number(txn.total).toFixed(2)}</td>
                <td class="py-3 px-4 text-center">
                    <button onclick='showReceiptModal(${JSON.stringify(txn)})' class="text-roseGold-600 hover:text-roseGold-800 text-xs font-semibold">Ver Recibo</button>
                </td>
            </tr>
        `;
    });
}

function clearSalesHistory() {
    if (!isAdmin()) return;
    if (confirm('¿Desea limpiar todo el historial de ventas?')) {
        salesHistory = [];
        renderSalesHistory();
        updateDashboardStats();
    }
}

function downloadDailyReportPDF() {
    if (!isAdmin()) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const todayStr = new Date().toLocaleDateString();
    const todayTxns = salesHistory.filter(t => t.date.includes(todayStr));
    const totalToday = todayTxns.reduce((sum, t) => sum + t.total, 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("GLOW & GLAMOUR - REPORTE DIARIO DE VENTAS", 14, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${todayStr} | Moneda: Bolivianos (Bs.)`, 14, 28);

    let y = 40;
    doc.setFont("helvetica", "bold");
    doc.text("ID Transacción", 14, y);
    doc.text("Fecha y Hora", 60, y);
    doc.text("Método", 120, y);
    doc.text("Total (Bs.)", 170, y, { align: "right" });
    doc.line(14, y + 2, 196, y + 2);

    y += 8;
    doc.setFont("helvetica", "normal");
    if (todayTxns.length === 0) {
        doc.text("No hay ventas registradas el día de hoy.", 14, y);
    } else {
        todayTxns.forEach(t => {
            if (y > 270) { doc.addPage(); y = 20; }
            doc.text(t.id, 14, y);
            doc.text(t.date, 60, y);
            doc.text(t.paymentMethod, 120, y);
            doc.text(`Bs. ${Number(t.total).toFixed(2)}`, 196, y, { align: "right" });
            y += 8;
        });
    }

    y += 6;
    doc.line(14, y, 196, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`TOTAL RECAUDADO HOY: Bs. ${totalToday.toFixed(2)}`, 196, y, { align: "right" });

    doc.save(`Reporte_Ventas_${todayStr.replace(/\//g, '-')}.pdf`);
}

function updateDashboardStats() {
    if (!isAdmin()) return;
    const todayStr = new Date().toLocaleDateString();
    const todayTxns = salesHistory.filter(t => t.date.includes(todayStr));
    const salesToday = todayTxns.reduce((sum, t) => sum + t.total, 0);
    const itemsSoldToday = todayTxns.reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.qty, 0), 0);
    const inventoryVal = products.reduce((sum, p) => sum + (p.price * p.stock), 0);

    document.getElementById('stat-sales-today').innerText = `Bs. ${salesToday.toFixed(2)}`;
    document.getElementById('stat-items-sold').innerText = itemsSoldToday;
    document.getElementById('stat-transactions').innerText = salesHistory.length;
    document.getElementById('stat-inventory-val').innerText = `Bs. ${inventoryVal.toFixed(2)}`;

    const lowStockList = document.getElementById('low-stock-list');
    lowStockList.innerHTML = '';
    const lowStockItems = products.filter(p => p.stock <= 5);
    if (lowStockItems.length === 0) {
        lowStockList.innerHTML = `<p class="text-xs text-gray-400">No hay alertas de stock bajo.</p>`;
    } else {
        lowStockItems.forEach(p => {
            lowStockList.innerHTML += `
                <div class="flex justify-between items-center bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 text-xs">
                    <span class="font-semibold text-gray-800">${p.name}</span>
                    <span class="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-md">${p.stock} disp.</span>
                </div>
            `;
        });
    }

    const catStats = document.getElementById('category-stats-list');
    catStats.innerHTML = '';
    ['Maquillaje', 'Skincare', 'Capilar', 'Perfumes'].forEach(c => {
        const count = products.filter(p => p.category === c).length;
        catStats.innerHTML += `
            <div class="flex justify-between items-center text-xs">
                <span class="text-gray-600 font-medium">${c}</span>
                <span class="font-bold text-gray-900">${count} productos</span>
            </div>
        `;
    });
}