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
let whatsappNumber = '59174134370'; // Tu número de WhatsApp con código de país (591)

// PRODUCTO SELECCIONADO PARA EL MODAL DE DETALLE
let selectedProductForModal = null;
let modalQuantity = 1;

// ESCUCHADOR DE ESTADO EN TIEMPO REAL (FIREBASE AUTH)
window.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    if (auth) {
        auth.onAuthStateChanged((user) => {
            if (user) {
                setupAdminView();
            } else {
                setupCustomerView();
            }
            loadDataFromFirebase();
        });
    }

    const prodImageInput = document.getElementById('prod-image-file');
    if (prodImageInput) {
        prodImageInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    const preview = document.getElementById('image-preview');
                    const container = document.getElementById('image-preview-container');
                    if (preview) preview.src = event.target.result;
                    if (container) container.classList.remove('hidden');
                };
                reader.readAsDataURL(file);

                const btn = document.getElementById('save-prod-btn');
                if (btn) {
                    btn.innerText = 'Subiendo a Cloudinary...';
                    btn.disabled = true;
                }

                try {
                    const uploadedUrl = await uploadImageToCloudinary(file);
                    const urlInput = document.getElementById('prod-image-url');
                    if (urlInput) urlInput.value = uploadedUrl;
                    if (btn) {
                        btn.innerText = 'Guardar Producto';
                        btn.disabled = false;
                    }
                } catch (err) {
                    console.error("Error subiendo imagen:", err);
                    alert("No se pudo subir la imagen a Cloudinary.");
                    if (btn) {
                        btn.innerText = 'Guardar Producto';
                        btn.disabled = false;
                    }
                }
            }
        });
    }
});

function updateClock() {
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
        const now = new Date();
        timeEl.innerText = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
    }
}

function isAdmin() {
    return auth && auth.currentUser !== null;
}

function setupAdminView() {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    
    const badge = document.getElementById('user-role-badge');
    if (badge && auth.currentUser) {
        badge.innerText = `Admin: ${auth.currentUser.email}`;
        badge.className = 'text-[10px] text-roseGold-600 font-bold';
    }
    
    const posLabel = document.getElementById('nav-pos-label');
    if (posLabel) posLabel.innerText = 'Ventas';

    const checkoutBtnText = document.getElementById('checkout-btn-text');
    if (checkoutBtnText) checkoutBtnText.innerText = 'Cobrar';

    const landing = document.getElementById('auth-landing-screen');
    const header = document.getElementById('main-header');
    if (landing) landing.classList.add('hidden');
    if (header) header.classList.remove('hidden');
}

function setupCustomerView() {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    
    const badge = document.getElementById('user-role-badge');
    if (badge) {
        badge.innerText = 'Modo: Catálogo Cliente';
        badge.className = 'text-[10px] text-emerald-600 font-bold';
    }

    const posLabel = document.getElementById('nav-pos-label');
    if (posLabel) posLabel.innerText = 'Catálogo';

    const checkoutBtnText = document.getElementById('checkout-btn-text');
    if (checkoutBtnText) checkoutBtnText.innerText = 'Enviar Pedido por WhatsApp';

    const landing = document.getElementById('auth-landing-screen');
    const header = document.getElementById('main-header');
    if (landing) landing.classList.add('hidden');
    if (header) header.classList.remove('hidden');

    switchTab('pos');
}

function enterAsCustomer() {
    if (auth && auth.currentUser) {
        auth.signOut();
    }
    setupCustomerView();
}

async function loginAsAdmin() {
    const emailEl = document.getElementById('admin-email');
    const passwordEl = document.getElementById('admin-password');
    const errorMsgEl = document.getElementById('login-error-msg');

    if (errorMsgEl) {
        errorMsgEl.classList.add('hidden');
        errorMsgEl.innerText = '';
    }

    const email = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';

    if (!email || !password) {
        if (errorMsgEl) {
            errorMsgEl.innerText = 'Por favor ingresa tu correo y contraseña.';
            errorMsgEl.classList.remove('hidden');
        }
        return;
    }

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        console.error(error);
        if (errorMsgEl) {
            errorMsgEl.innerText = translateFirebaseError(error.code);
            errorMsgEl.classList.remove('hidden');
        }
    }
}

function translateFirebaseError(code) {
    switch (code) {
        case 'auth/user-not-found': return 'El usuario no está registrado.';
        case 'auth/wrong-password': return 'Contraseña incorrecta.';
        case 'auth/invalid-email': return 'El correo electrónico no es válido.';
        case 'auth/invalid-credential': return 'Correo o contraseña incorrectos.';
        default: return 'Error al iniciar sesión.';
    }
}

function logoutSession() {
    if (auth) auth.signOut();
    const emailEl = document.getElementById('admin-email');
    const passwordEl = document.getElementById('admin-password');
    const errorMsgEl = document.getElementById('login-error-msg');
    if (emailEl) emailEl.value = '';
    if (passwordEl) passwordEl.value = '';
    if (errorMsgEl) errorMsgEl.classList.add('hidden');

    const landing = document.getElementById('auth-landing-screen');
    const header = document.getElementById('main-header');
    if (landing) landing.classList.remove('hidden');
    if (header) header.classList.add('hidden');
}

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

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-600', 'hover:text-roseGold-600', 'hover:bg-roseGold-50');
        activeBtn.classList.add('bg-roseGold-500', 'text-white', 'shadow-sm');
    }

    if (tabId === 'inventory') renderInventoryTable();
    if (tabId === 'history') renderSalesHistory();
    if (tabId === 'dashboard') updateDashboardStats();
}

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
    const searchInput = document.getElementById('pos-search');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = products.filter(p => {
        const matchCat = currentCategory === 'Todos' || p.category === currentCategory;
        const matchQuery = (p.name || '').toLowerCase().includes(query) || (p.sku || '').toLowerCase().includes(query);
        return matchCat && matchQuery;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12 text-gray-400 text-sm">No hay productos disponibles</div>`;
        return;
    }

    filtered.forEach(p => {
        const priceNum = Number(p.price || 0).toFixed(2);
        grid.innerHTML += `
            <div onclick="openProductDetailModal('${p.id}')" class="bg-white p-3 rounded-2xl border border-roseGold-100 hover:border-roseGold-400 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group">
                <div>
                    <div class="h-32 rounded-xl bg-gray-100 mb-2 overflow-hidden relative">
                        <img src="${p.image || 'https://via.placeholder.com/300'}" alt="${p.name || ''}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                        <span class="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-0.5 rounded-full text-gray-700">${p.stock || 0} disp.</span>
                    </div>
                    <h4 class="font-semibold text-xs text-gray-800 line-clamp-2">${p.name || 'Sin nombre'}</h4>
                    <p class="text-[10px] text-gray-400 mt-0.5">${p.sku || ''}</p>
                </div>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-gray-50">
                    <span class="font-extrabold text-roseGold-600 text-sm">Bs. ${priceNum}</span>
                    <span class="w-7 h-7 rounded-xl bg-roseGold-50 text-roseGold-600 flex items-center justify-center group-hover:bg-roseGold-500 group-hover:text-white transition-colors">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </span>
                </div>
            </div>
        `;
    });
}

function openProductDetailModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if ((product.stock || 0) <= 0) {
        alert('Este producto está agotado.');
        return;
    }

    selectedProductForModal = product;
    modalQuantity = 1;

    const nameEl = document.getElementById('modal-prod-name');
    const imgEl = document.getElementById('modal-prod-img');
    const stockEl = document.getElementById('modal-prod-stock');
    const skuEl = document.getElementById('modal-prod-sku');
    const descEl = document.getElementById('modal-prod-desc');
    const priceEl = document.getElementById('modal-prod-price');
    const qtyEl = document.getElementById('modal-prod-qty');
    const modalEl = document.getElementById('product-detail-modal');

    if (nameEl) nameEl.innerText = product.name || '';
    if (imgEl) imgEl.src = product.image || 'https://via.placeholder.com/300';
    if (stockEl) stockEl.innerText = `${product.stock || 0} disp.`;
    if (skuEl) skuEl.innerText = `SKU: ${product.sku || ''}`;
    if (descEl) descEl.innerText = product.description || 'Producto exclusivo de alta calidad formulado para realzar tu belleza natural.';
    if (priceEl) priceEl.innerText = `Bs. ${Number(product.price || 0).toFixed(2)}`;
    if (qtyEl) qtyEl.innerText = modalQuantity;
    if (modalEl) modalEl.classList.remove('hidden');
}

function closeProductDetailModal() {
    const modalEl = document.getElementById('product-detail-modal');
    if (modalEl) modalEl.classList.add('hidden');
    selectedProductForModal = null;
}

function adjustModalQty(delta) {
    if (!selectedProductForModal) return;
    const newQty = modalQuantity + delta;
    const maxStock = selectedProductForModal.stock || 0;
    if (newQty >= 1 && newQty <= maxStock) {
        modalQuantity = newQty;
        const qtyEl = document.getElementById('modal-prod-qty');
        if (qtyEl) qtyEl.innerText = modalQuantity;
    } else if (newQty > maxStock) {
        alert('Has alcanzado el stock máximo disponible.');
    }
}

function confirmAddToCart() {
    if (!selectedProductForModal) return;

    const existing = cart.find(item => item.id === selectedProductForModal.id);
    const maxStock = selectedProductForModal.stock || 0;

    if (existing) {
        const totalRequested = existing.qty + modalQuantity;
        if (totalRequested <= maxStock) {
            existing.qty = totalRequested;
        } else {
            existing.qty = maxStock;
            alert('Stock máximo alcanzado en el carrito.');
        }
    } else {
        cart.push({ ...selectedProductForModal, qty: modalQuantity });
    }

    renderCart();
    closeProductDetailModal();
}

function updateCartQty(productId, delta) {
    const item = cart.find(i => i.id === productId);
    const product = products.find(p => p.id === productId);
    if (!item || !product) return;

    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== productId);
    } else if (item.qty > (product.stock || 0)) {
        item.qty = product.stock || 0;
        alert('Stock máximo alcanzado.');
    }
    renderCart();
}

function removeFromCart(productId) {
    cart = cart.filter(i => i.id !== productId);
    renderCart();
}

function clearCart() {
    cart = [];
    const discountEl = document.getElementById('cart-discount');
    if (discountEl) discountEl.value = 0;
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-count-badge');
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!container || !badge || !checkoutBtn) return;

    const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
    badge.innerText = `${totalItems} items`;

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
        const itemTotal = Number((item.price || 0) * item.qty).toFixed(2);
        container.innerHTML += `
            <div class="py-3 flex items-center justify-between">
                <div class="flex items-center space-x-3 overflow-hidden">
                    <img src="${item.image || ''}" class="w-10 h-10 rounded-xl object-cover flex-shrink-0">
                    <div class="overflow-hidden">
                        <h5 class="font-semibold text-xs text-gray-800 truncate">${item.name || ''}</h5>
                        <p class="text-xs text-roseGold-600 font-bold">Bs. ${itemTotal}</p>
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
    const subtotal = cart.reduce((sum, i) => sum + ((i.price || 0) * i.qty), 0);
    const discountInput = document.getElementById('cart-discount');
    const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
    const total = Math.max(0, subtotal - discount);

    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total');

    if (subtotalEl) subtotalEl.innerText = `Bs. ${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.innerText = `Bs. ${total.toFixed(2)}`;
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
    let msg = `*¡Hola! Nuevo Pedido - L&F Belleza & Cuidado*%0A%0A`;
    cart.forEach(item => {
        msg += `- ${item.name || ''} (x${item.qty}) : Bs. ${((item.price || 0) * item.qty).toFixed(2)}%0A`;
    });
    msg += `%0A*Subtotal:* Bs. ${subtotal.toFixed(2)}`;
    if (discount > 0) msg += `%0A*Descuento:* Bs. ${discount.toFixed(2)}`;
    msg += `%0A*TOTAL A PAGAR:* Bs. ${total.toFixed(2)}%0A%0A¡Quedo a la espera de la confirmación!`;

    window.open(`https://wa.me/${whatsappNumber}?text=${msg}`, '_blank');
}

function openCheckoutModal() {
    if (!isAdmin()) return;
    const { total } = updateCartCalculations();
    const totalDisplay = document.getElementById('modal-total-display');
    const cashTendered = document.getElementById('cash-tendered');
    const cashChange = document.getElementById('cash-change');
    const modal = document.getElementById('checkout-modal');

    if (totalDisplay) totalDisplay.innerText = `Bs. ${total.toFixed(2)}`;
    if (cashTendered) cashTendered.value = '';
    if (cashChange) cashChange.innerText = 'Bs. 0.00';
    if (modal) modal.classList.remove('hidden');
}

function closeCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) modal.classList.add('hidden');
}

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
    const cashSec = document.getElementById('cash-input-section');
    if (cashSec) cashSec.style.display = method === 'Efectivo' ? 'block' : 'none';
}

function calculateChange() {
    const { total } = updateCartCalculations();
    const tenderedInput = document.getElementById('cash-tendered');
    const tendered = tenderedInput ? (parseFloat(tenderedInput.value) || 0) : 0;
    const changeEl = document.getElementById('cash-change');
    if (changeEl) changeEl.innerText = `Bs. ${Math.max(0, tendered - total).toFixed(2)}`;
}

async function processCheckout() {
    if (!isAdmin()) return;

    const { subtotal, discount, total } = updateCartCalculations();
    if (currentPaymentMethod === 'Efectivo') {
        const tenderedInput = document.getElementById('cash-tendered');
        const tendered = tenderedInput ? (parseFloat(tenderedInput.value) || 0) : 0;
        if (tendered < total) { alert('El efectivo recibido es insuficiente.'); return; }
    }

    cart.forEach(item => {
        const p = products.find(prod => prod.id === item.id);
        if (p) p.stock = (p.stock || 0) - item.qty;
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
        try {
            await db.collection('salesHistory').add(transaction);
            for (let item of cart) {
                const p = products.find(prod => prod.id === item.id);
                if (p) {
                    await db.collection('products').doc(item.id).update({ stock: p.stock });
                }
            }
        } catch (err) {
            console.error("Error al guardar venta en Firestore:", err);
        }
    }

    closeCheckoutModal();
    clearCart();
    renderProducts();
    renderInventoryTable();
    showReceiptModal(transaction);
}

function showReceiptModal(txn) {
    const recId = document.getElementById('rec-id');
    const recDate = document.getElementById('rec-date');
    const recPayment = document.getElementById('rec-payment');
    const recSubtotal = document.getElementById('rec-subtotal');
    const recDiscount = document.getElementById('rec-discount');
    const recTotal = document.getElementById('rec-total');
    const receiptModal = document.getElementById('receipt-modal');

    if (recId) recId.innerText = txn.id || '';
    if (recDate) recDate.innerText = txn.date || '';
    if (recPayment) recPayment.innerText = txn.paymentMethod || '';
    if (recSubtotal) recSubtotal.innerText = `Bs. ${(txn.subtotal || 0).toFixed(2)}`;
    if (recDiscount) recDiscount.innerText = `Bs. ${(txn.discount || 0).toFixed(2)}`;
    if (recTotal) recTotal.innerText = `Bs. ${(txn.total || 0).toFixed(2)}`;

    const listContainer = document.getElementById('rec-items-list');
    if (listContainer) {
        listContainer.innerHTML = '';
        (txn.items || []).forEach(i => {
            const itemTotal = Number((i.price || 0) * i.qty).toFixed(2);
            listContainer.innerHTML += `<div class="flex justify-between"><span>${i.qty}x ${i.name || ''}</span><span>Bs. ${itemTotal}</span></div>`;
        });
    }

    if (receiptModal) receiptModal.classList.remove('hidden');
}

function closeReceiptModal() {
    const receiptModal = document.getElementById('receipt-modal');
    if (receiptModal) receiptModal.classList.add('hidden');
}

function renderInventoryTable() {
    if (!isAdmin()) return;
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-gray-400">No hay productos en el inventario</td></tr>`;
        return;
    }

    products.forEach(p => {
        const stockVal = p.stock || 0;
        const statusBadge = stockVal > 5 
            ? `<span class="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-xs font-semibold">Normal</span>`
            : `<span class="bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full text-xs font-semibold">Stock Bajo</span>`;

        tbody.innerHTML += `
            <tr class="hover:bg-roseGold-50/30 transition-colors border-b border-gray-100">
                <td class="py-3 px-4 flex items-center space-x-3">
                    <img src="${p.image || ''}" class="w-10 h-10 rounded-xl object-cover">
                    <span class="font-semibold text-gray-800">${p.name || ''}</span>
                </td>
                <td class="py-3 px-4 text-gray-500 font-mono text-xs">${p.sku || ''}</td>
                <td class="py-3 px-4 text-gray-600">${p.category || ''}</td>
                <td class="py-3 px-4 text-right font-bold text-gray-900">Bs. ${Number(p.price || 0).toFixed(2)}</td>
                <td class="py-3 px-4 text-center font-semibold">${stockVal}</td>
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
    const form = document.getElementById('product-form');
    if (form) form.reset();

    const editId = document.getElementById('edit-product-id');
    const imgUrl = document.getElementById('prod-image-url');
    const previewContainer = document.getElementById('image-preview-container');
    const modalTitle = document.getElementById('product-modal-title');
    const modal = document.getElementById('product-modal');

    if (editId) editId.value = '';
    if (imgUrl) imgUrl.value = '';
    if (previewContainer) previewContainer.classList.add('hidden');

    if (product) {
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-pen text-roseGold-600"></i><span>Editar Producto</span>`;
        if (editId) editId.value = product.id || '';
        
        const nameEl = document.getElementById('prod-name');
        const skuEl = document.getElementById('prod-sku');
        const catEl = document.getElementById('prod-cat');
        const descEl = document.getElementById('prod-desc');
        const priceEl = document.getElementById('prod-price');
        const stockEl = document.getElementById('prod-stock');

        if (nameEl) nameEl.value = product.name || '';
        if (skuEl) skuEl.value = product.sku || '';
        if (catEl) catEl.value = product.category || 'Maquillaje';
        if (descEl) descEl.value = product.description || '';
        if (priceEl) priceEl.value = product.price || 0;
        if (stockEl) stockEl.value = product.stock || 0;
        if (imgUrl) imgUrl.value = product.image || '';

        if (product.image) {
            const preview = document.getElementById('image-preview');
            if (preview) preview.src = product.image;
            if (previewContainer) previewContainer.classList.remove('hidden');
        }
    } else {
        if (modalTitle) modalTitle.innerHTML = `<i class="fa-solid fa-box text-roseGold-600"></i><span>Nuevo Producto</span>`;
    }

    if (modal) modal.classList.remove('hidden');
}

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.add('hidden');
}

async function saveProduct(e) {
    e.preventDefault();
    if (!isAdmin()) return;

    const editId = document.getElementById('edit-product-id').value;
    const name = document.getElementById('prod-name')?.value || '';
    const sku = document.getElementById('prod-sku')?.value || '';
    const category = document.getElementById('prod-cat')?.value || 'Maquillaje';
    const description = document.getElementById('prod-desc')?.value || '';
    const price = parseFloat(document.getElementById('prod-price')?.value || 0);
    const stock = parseInt(document.getElementById('prod-stock')?.value || 0);
    let image = document.getElementById('prod-image-url')?.value || 'https://via.placeholder.com/300';

    const productData = { name, sku, category, description, price, stock, image };

    try {
        if (editId) {
            const index = products.findIndex(item => item.id == editId);
            if (index !== -1) products[index] = { id: editId, ...productData };
            if (db) await db.collection('products').doc(editId).update(productData);
        } else {
            if (db) {
                const docRef = await db.collection('products').add(productData);
                products.push({ id: docRef.id, ...productData });
            } else {
                products.push({ id: String(Date.now()), ...productData });
            }
        }
    } catch (err) {
        console.error("Error al guardar producto:", err);
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
        if (db) {
            try {
                await db.collection('products').doc(id).delete();
            } catch (err) {
                console.error("Error al eliminar de Firestore:", err);
            }
        }
        renderInventoryTable();
        renderProducts();
    }
}

function downloadExcelTemplate() {
    if (!isAdmin()) return;
    const templateData = [
        { Nombre: "Labial Ejemplo", SKU: "LAB-99", Categoria: "Maquillaje", Descripcion: "Labial mate larga duración", Precio_Bs: 50.00, Stock: 20, Imagen_URL: "https://images.unsplash.com/photo-1586495777744-4413f21062fa" }
    ];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla_Productos");
    XLSX.writeFile(workbook, "Plantilla_Catalogo_LyF.xlsx");
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
                    description: row.Descripcion || 'Producto importado de alta calidad.',
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
        const itemsSummary = (txn.items || []).map(i => `${i.qty}x ${i.name || ''}`).join(', ');
        tbody.innerHTML += `
            <tr class="hover:bg-roseGold-50/30 transition-colors border-b border-gray-100">
                <td class="py-3 px-4 font-mono font-semibold text-roseGold-700">${txn.id || ''}</td>
                <td class="py-3 px-4 text-gray-600">${txn.date || ''}</td>
                <td class="py-3 px-4 text-gray-800 truncate max-w-xs">${itemsSummary}</td>
                <td class="py-3 px-4"><span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs">${txn.paymentMethod || ''}</span></td>
                <td class="py-3 px-4 text-right font-bold text-gray-900">Bs. ${Number(txn.total || 0).toFixed(2)}</td>
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
    const todayTxns = salesHistory.filter(t => (t.date || '').includes(todayStr));
    const totalToday = todayTxns.reduce((sum, t) => sum + (t.total || 0), 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("L&F BELLEZA & CUIDADO - REPORTE DIARIO", 14, 20);
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
            doc.text(t.id || '', 14, y);
            doc.text(t.date || '', 60, y);
            doc.text(t.paymentMethod || '', 120, y);
            doc.text(`Bs. ${Number(t.total || 0).toFixed(2)}`, 196, y, { align: "right" });
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
    const todayTxns = salesHistory.filter(t => (t.date || '').includes(todayStr));
    const salesToday = todayTxns.reduce((sum, t) => sum + (t.total || 0), 0);
    const itemsSoldToday = todayTxns.reduce((sum, t) => sum + (t.items || []).reduce((s, i) => s + i.qty, 0), 0);
    const inventoryVal = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);

    const statSales = document.getElementById('stat-sales-today');
    const statItems = document.getElementById('stat-items-sold');
    const statTxns = document.getElementById('stat-transactions');
    const statInv = document.getElementById('stat-inventory-val');

    if (statSales) statSales.innerText = `Bs. ${salesToday.toFixed(2)}`;
    if (statItems) statItems.innerText = itemsSoldToday;
    if (statTxns) statTxns.innerText = salesHistory.length;
    if (statInv) statInv.innerText = `Bs. ${inventoryVal.toFixed(2)}`;

    const lowStockList = document.getElementById('low-stock-list');
    if (lowStockList) {
        lowStockList.innerHTML = '';
        const lowStockItems = products.filter(p => (p.stock || 0) <= 5);
        if (lowStockItems.length === 0) {
            lowStockList.innerHTML = `<p class="text-xs text-gray-400">No hay alertas de stock bajo.</p>`;
        } else {
            lowStockItems.forEach(p => {
                lowStockList.innerHTML += `
                    <div class="flex justify-between items-center bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 text-xs">
                        <span class="font-semibold text-gray-800">${p.name || ''}</span>
                        <span class="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-md">${p.stock || 0} disp.</span>
                    </div>
                `;
            });
        }
    }

    const catStats = document.getElementById('category-stats-list');
    if (catStats) {
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
}