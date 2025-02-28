document.addEventListener("DOMContentLoaded", function () {
  const maxAttempts = 1;
  const timeWindow = 10000;
  const attemptKey = "welcome_attempts";

  let attempts = JSON.parse(localStorage.getItem(attemptKey)) || [];
  const now = Date.now();

  attempts = attempts.filter((timestamp) => now - timestamp < timeWindow);

  attempts.push(now);
  localStorage.setItem(attemptKey, JSON.stringify(attempts));

  if (attempts.length >= maxAttempts) {
    console.warn("Infinite redirect detected. Staying on /welcome.");
    return;
  }

  let fallbackTimeout = setTimeout(() => {
    console.warn("Possible infinite loop detected. Redirecting to /welcome...");
    window.location.href = "/welcome";
  }, 3000); // If session check takes too long, redirect

  fetch("/check-session", { credentials: "include" })
    .then((response) => response.json())
    .then((data) => {
      clearTimeout(fallbackTimeout);
      if (data.loggedIn) {
        window.location.href = "/";
      }
    })
    .catch((error) => {
      console.error("Session check error:", error);
      window.location.href = "/welcome";
    });
});

document.addEventListener("DOMContentLoaded", function () {
  fetch("/random-books")
    .then((response) => response.json())
    .then((bookIds) => {
      const bookshelf = document.getElementById("recommended-books");
      let booksFetched = 0;
      bookIds.forEach((bookId) => {
        if (booksFetched >= 25) return;
        fetch(`/book/${bookId}`)
          .then((response) => response.json())
          .then((book) => {
            if (!book || book.error) return;
            let coverUrl = book.thumbnail_url || "/static/images/nobook.jpg";
            if (
              coverUrl ===
              "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
            ) {
              coverUrl = "/static/images/nobook.jpg";
            }
            const bookDiv = document.createElement("div");
            bookDiv.classList.add(
              "bookshelf",
              "flex",
              "flex-col",
              "justify-end"
            );
            bookDiv.innerHTML = `
              <div class="book w-full">
                <div class="cover">
                  <img src="${coverUrl}" alt="${book.title}" class="w-full h-full object-cover">
                </div>
                <a class="link"></a>
              </div>
            `;
            bookshelf.appendChild(bookDiv);
            booksFetched++;
          })
          .catch((error) =>
            console.error("Error fetching book details:", error)
          );
      });
    })
    .catch((error) => console.error("Error loading books:", error));
});

document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const switchToRegister = document.querySelector("#switch-to-register");
  const switchToLogin = document.querySelector("#switch-to-login");
  const registerButton = document.querySelector("#register-btn");

  // Show login form by default
  registerForm.style.display = "none";

  switchToRegister.addEventListener("click", function (event) {
    event.preventDefault();
    loginForm.style.display = "none";
    registerForm.style.display = "flex";
  });

  switchToLogin.addEventListener("click", function (event) {
    event.preventDefault();
    registerForm.style.display = "none";
    loginForm.style.display = "flex";
  });

  // Real-time validation
  const emailInput = document.querySelector("#register-email");
  const passwordInput = document.querySelector("#password");
  const confirmPasswordInput = document.querySelector("#confirm-password");

  emailInput.addEventListener("input", function () {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    emailInput.classList.toggle(
      "border-red-500",
      !emailPattern.test(emailInput.value)
    );
  });

  passwordInput.addEventListener("input", function () {
    passwordInput.classList.toggle(
      "border-red-500",
      !/^[a-zA-Z0-9]+$/.test(passwordInput.value)
    );
  });

  confirmPasswordInput.addEventListener("input", function () {
    confirmPasswordInput.classList.toggle(
      "border-red-500",
      confirmPasswordInput.value !== passwordInput.value
    );
  });

  // Submit registration form
  registerButton.addEventListener("click", function (event) {
    event.preventDefault();

    const email = emailInput.value;
    const username = document.querySelector("#username").value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!/^[a-zA-Z0-9]+$/.test(password)) {
      alert("Password must contain only letters and numbers!");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        email,
        password,
        confirm_password: confirmPassword,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
        } else {
          const form = document.querySelector("#register-form");
          form.innerHTML = `
            <div class="flex flex-col items-center justify-center gap-4">
              <span class="text-color-logo flex flex-row justify-center py-4 font-logo text-4xl">
                Bookologia
              </span>
              <img src="/static/icons/validation.gif" alt="Success" class="w-20 h-20"/>
            </div>
          `;

          setTimeout(() => {
            window.location.href = data.redirect;
          }, 10000);
        }
      })
      .catch((error) => console.error("Error registering user:", error));
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const emailInput = document.querySelector("#register-email");
  const usernameInput = document.querySelector("#username");
  const passwordInput = document.querySelector("#password");
  const confirmPasswordInput = document.querySelector("#confirm-password");
  const errorSpan = document.querySelector("#username-error");

  function toggleCheckIcon(inputField, isValid) {
    const checkIcon = inputField.parentElement.querySelector(".check-icon");
    checkIcon.classList.toggle("hidden", !isValid);
  }

  function showError(message, inputField) {
    errorSpan.textContent = message;
    errorSpan.classList.remove("hidden");

    inputField.classList.add("border-red-500");
    toggleCheckIcon(inputField, false);
  }

  function clearError(inputField) {
    errorSpan.textContent = "";
    errorSpan.classList.add("hidden");

    inputField.classList.remove("border-red-500");
    toggleCheckIcon(inputField, true);
  }

  function validateUsername() {
    if (usernameInput.value.trim() === "") {
      showError("Username cannot be empty.", usernameInput);
    } else {
      clearError(usernameInput);
    }
  }

  function validateEmail() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(emailInput.value)) {
      showError("Invalid email format.", emailInput);
    } else {
      fetch("/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.exists) {
            showError("Email already registered.", emailInput);
          } else {
            clearError(emailInput);
          }
        })
        .catch((error) => console.error("Error checking email:", error));
    }
  }

  function validatePassword() {
    const hasLetters = /[a-zA-Z]/.test(passwordInput.value);
    const hasNumbers = /[0-9]/.test(passwordInput.value);
    const isValid =
      hasLetters && hasNumbers && /^[a-zA-Z0-9]+$/.test(passwordInput.value);

    if (!isValid) {
      showError("Password must contain letters and numbers.", passwordInput);
    } else {
      clearError(passwordInput);
    }
  }

  function validateConfirmPassword() {
    if (
      confirmPasswordInput.value !== passwordInput.value ||
      passwordInput.value === ""
    ) {
      showError("Passwords do not match.", confirmPasswordInput);
    } else {
      clearError(confirmPasswordInput);
    }
  }

  // Attach event listeners to validate only the active field
  usernameInput.addEventListener("input", validateUsername);
  emailInput.addEventListener("input", validateEmail);
  passwordInput.addEventListener("input", validatePassword);
  confirmPasswordInput.addEventListener("input", validateConfirmPassword);
});

document.addEventListener("DOMContentLoaded", function () {
  const loginForm = document.querySelector("#login-form");
  const loginButton = document.querySelector("#login-btn");
  const emailInput = document.querySelector("#login-email");
  const passwordInput = document.querySelector("#login-password");
  const errorSpan = document.querySelector("#login-error");

  if (
    !loginForm ||
    !loginButton ||
    !emailInput ||
    !passwordInput ||
    !errorSpan
  ) {
    console.error("Login elements not found, check HTML structure.");
    return;
  }

  function showError(message) {
    errorSpan.textContent = message;
    errorSpan.classList.remove("hidden");
  }

  function clearError() {
    errorSpan.textContent = "";
    errorSpan.classList.add("hidden");
  }

  loginButton.addEventListener("click", function (event) {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) {
          showError(data.error);
        } else {
          localStorage.setItem("userSession", JSON.stringify(data.user));
          window.location.href = data.redirect;
        }
      })
      .catch((error) => {
        console.error("Login error:", error);
        showError("An unexpected error occurred. Please try again.");
      });
  });
});
