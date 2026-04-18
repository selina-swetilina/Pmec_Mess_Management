// ===== ROLE DATA =====
var roles = {
  student: {
    label: "Student",
    description: "Access campus food deals and rescue meals",
  },
  vendor: {
    label: "Vendor",
    description: "List surplus food and manage your inventory",
  },
  admin: {
    label: "Admin",
    description: "Monitor the platform and manage operations",
  },
};

// ===== STATE =====
var selectedRole = "student";
var showPassword = false;

// ===== DOM REFERENCES =====
var roleTabs = document.querySelectorAll(".role-tab");
var formTitle = document.getElementById("form-title");
var formDesc = document.getElementById("form-desc");
var submitBtn = document.getElementById("submit-btn");
var submitText = document.getElementById("submit-text");
var loginForm = document.getElementById("login-form");
var emailInput = document.getElementById("email");
var passwordInput = document.getElementById("password");
var toggleBtn = document.getElementById("toggle-password");
var eyeOpen = document.getElementById("eye-open");
var eyeClosed = document.getElementById("eye-closed");
var emailError = document.getElementById("email-error");
var pwError = document.getElementById("pw-error");

// Login alert banner elements
var loginAlert = document.getElementById("login-alert");
var loginAlertText = document.getElementById("login-alert-text");

// ===== LOGIN ALERT HELPERS =====
function showLoginAlert(message, type) {
  loginAlert.style.display = "flex";
  loginAlertText.textContent = message;
  loginAlert.className = "login-alert" + (type === "warning" ? " login-alert--warning" : "");
}

function hideLoginAlert() {
  loginAlert.style.display = "none";
  loginAlertText.textContent = "";
}

// ===== INPUT SANITIZATION (Injection Prevention) =====
function sanitizeInput(str) {
  if (typeof str !== "string") return "";
  // Strip HTML/script tags
  str = str.replace(/<[^>]*>/g, "");
  // Block NoSQL injection operators
  str = str.replace(/\$[a-zA-Z]+/g, "");
  // Remove dangerous characters used in injections
  str = str.replace(/[{}()\[\]]/g, "");
  return str.trim();
}

// Modal elements
var forgotBtn = document.getElementById("forgot-btn");
var modalOverlay = document.getElementById("modal-overlay");
var modalClose = document.getElementById("modal-close");
var resetForm = document.getElementById("reset-form");
var resetEmailInput = document.getElementById("reset-email");
var resetError = document.getElementById("reset-error");
var resetSuccess = document.getElementById("reset-success");

// ===== ROLE SWITCHING =====
function setRole(role) {
  selectedRole = role;

  roleTabs.forEach(function (tab) {
    if (tab.dataset.role === role) {
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
    } else {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    }
  });

  formTitle.textContent = "Sign in as " + roles[role].label;
  formDesc.textContent = roles[role].description;
  submitText.textContent = "Sign in as " + roles[role].label;

  // Disable "Forgot password?" for admin role
if (role === "admin") {
  forgotBtn.classList.add("disabled");
  forgotBtn.setAttribute("aria-disabled", "true");
} else {
  forgotBtn.classList.remove("disabled");
  forgotBtn.removeAttribute("aria-disabled");
}

  // Clear errors on role switch
  clearErrors();
  hideLoginAlert();
}

roleTabs.forEach(function (tab) {
  tab.addEventListener("click", function () {
    setRole(tab.dataset.role);
  });
});

// ===== PASSWORD TOGGLE =====
toggleBtn.addEventListener("click", function () {
  showPassword = !showPassword;
  passwordInput.type = showPassword ? "text" : "password";
  eyeOpen.style.display = showPassword ? "none" : "block";
  eyeClosed.style.display = showPassword ? "block" : "none";
  toggleBtn.setAttribute(
    "aria-label",
    showPassword ? "Hide password" : "Show password"
  );
});

// ===== VALIDATION =====
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clearErrors() {
  emailError.textContent = "";
  pwError.textContent = "";
  emailInput.classList.remove("input-error");
  passwordInput.classList.remove("input-error");
}

function validateForm() {
  var valid = true;
  clearErrors();

  if (!emailInput.value.trim()) {
    emailError.textContent = "Email address is required";
    emailInput.classList.add("input-error");
    valid = false;
  } else if (!isValidEmail(emailInput.value.trim())) {
    emailError.textContent = "Please enter a valid email address";
    emailInput.classList.add("input-error");
    valid = false;
  }

  if (!passwordInput.value) {
    pwError.textContent = "Password is required";
    passwordInput.classList.add("input-error");
    valid = false;
  } else if (passwordInput.value.length < 6) {
    pwError.textContent = "Password must be at least 6 characters";
    passwordInput.classList.add("input-error");
    valid = false;
  }

  return valid;
}

// Clear individual field errors on input
emailInput.addEventListener("input", function () {
  emailError.textContent = "";
  emailInput.classList.remove("input-error");
  hideLoginAlert();
});

passwordInput.addEventListener("input", function () {
  pwError.textContent = "";
  passwordInput.classList.remove("input-error");
  hideLoginAlert();
});

// ===== FORM SUBMISSION =====
loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  if (!validateForm()) return;

  hideLoginAlert();
  submitBtn.disabled = true;
  submitText.innerHTML =
    '<span class="spinner-wrap"><span class="spinner"></span>Signing in...</span>';

  // Sanitize inputs to prevent injection attacks
  var cleanEmail = sanitizeInput(emailInput.value);
  var cleanPassword = passwordInput.value; // Don't strip password chars, just check length

  // Additional injection check — reject if email was altered by sanitization
  if (cleanEmail !== emailInput.value.trim()) {
    submitBtn.disabled = false;
    submitText.textContent = "Sign in as " + roles[selectedRole].label;
    showLoginAlert("Invalid characters detected in email. Please use a valid email address.", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: cleanEmail,
        password: cleanPassword
      })
    });

    const data = await response.json();

    submitBtn.disabled = false;
    submitText.textContent = "Sign in as " + roles[selectedRole].label;

    if (!data.success) {
      // Show specific error messages inline
      if (data.message === "Invalid password") {
        showLoginAlert("Incorrect password. Please check your password and try again.", "error");
        passwordInput.classList.add("input-error");
        passwordInput.focus();
      } else if (data.message === "User not found") {
        showLoginAlert("No account found with this email address. Please check and try again.", "error");
        emailInput.classList.add("input-error");
        emailInput.focus();
      } else {
        showLoginAlert(data.message || "Login failed. Please try again.", "error");
      }
      return;
    }

    if (data.success) {
      if (data.role !== selectedRole) {
        showLoginAlert("You are registered as \"" + data.role + "\" but selected \"" + selectedRole + "\". Please choose the correct role tab above.", "warning");
        return;
      }
//JADE
      // Clear any stale auth data from other roles
      localStorage.removeItem("userEmail");
      localStorage.removeItem("studentId");
      localStorage.removeItem("vendorId");
      localStorage.removeItem("role");

      // Save role
      localStorage.setItem("role", data.role.toLowerCase());
//JADE
      // Save role-specific identifiers
      if (data.role === "admin") {
        localStorage.setItem("userEmail", emailInput.value.trim());
        window.location.href = "admin.html";
      } else if (data.role === "vendor") {
        localStorage.setItem("vendorId", emailInput.value.trim());
        window.location.href = "vendor_dashboard.html";
      } else {
        localStorage.setItem("studentId", emailInput.value.trim());
        localStorage.setItem("userEmail", emailInput.value.trim());
        window.location.href = "student_interface.html";
      }
    }
//JADE
  } catch (error) {
    submitBtn.disabled = false;
    submitText.textContent = "Sign in as " + roles[selectedRole].label;
    showLoginAlert("Unable to connect to the server. Please check your connection and try again.", "error");
  }
});


// ===== FORGOT PASSWORD MODAL =====
function openModal() {
  modalOverlay.classList.add("visible");
  resetForm.style.display = "";
  resetSuccess.classList.remove("visible");
  resetError.textContent = "";
  resetEmailInput.value = emailInput.value || "";
  resetEmailInput.classList.remove("input-error");

  // Trap focus
  setTimeout(function () {
    resetEmailInput.focus();
  }, 100);
}

function closeModal() {
  modalOverlay.classList.remove("visible");
}

forgotBtn.addEventListener("click", openModal);
modalClose.addEventListener("click", closeModal);

// Close on overlay click
modalOverlay.addEventListener("click", function (e) {
  if (e.target === modalOverlay) {
    closeModal();
  }
});

// Close on Escape key
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && modalOverlay.classList.contains("visible")) {
    closeModal();
  }
});

// Reset form submit
resetForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  resetError.textContent = "";
  resetEmailInput.classList.remove("input-error");

  var email = resetEmailInput.value.trim();

  if (!email) {
    resetError.textContent = "Email address is required";
    resetEmailInput.classList.add("input-error");
    return;
  }

  if (!isValidEmail(email)) {
    resetError.textContent = "Please enter a valid email address";
    resetEmailInput.classList.add("input-error");
    return;
  }

  try {
    const res = await fetch("http://localhost:5000/api/auth/forgot-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.message === "User not found") {
      resetError.textContent = "User not found";
      return;
    }

    // ✅ SUCCESS UI
    resetForm.style.display = "none";
    resetSuccess.classList.add("visible");

  } catch (err) {
    resetError.textContent = "Server error. Try again.";
  }
});