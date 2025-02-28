document.addEventListener("DOMContentLoaded", function () {
  // Check if the user session exists
  const userSession = localStorage.getItem("userSession");

  if (!userSession) {
    // Redirect to login if no session found
    window.location.href = "/welcome";
    return;
  }

  const searchBar = document.getElementById("search-bar");
  const resultsDiv = document.getElementById("results");
  const recommendedDiv = document.getElementById("recommended-books");
  const logoutButton = document.getElementById("logout-button");

  function fetchRecommended() {
    axios
      .get("/homeRecommendation")
      .then((response) => displayBooks(response.data, recommendedDiv))
      .catch((error) =>
        console.error("Error fetching recommendations:", error)
      );
  }

  function searchBooks(query) {
    if (query.length < 1) {
      resultsDiv.innerHTML = "";
      resultsDiv.classList.add("hidden");
      return;
    }
    axios
      .get(`/search/books?q=${query}`)
      .then((response) => {
        resultsDiv.innerHTML = "";
        displayBooks(response.data, resultsDiv);
        resultsDiv.classList.remove("hidden");
      })
      .catch((error) => console.error("Error searching books:", error));
  }

  function displayBooks(books, container) {
    container.innerHTML = "";
    books.forEach((item) => {
      const bookId = typeof item === "object" && item._id ? item._id : item;
      axios
        .get(`/book/${bookId}`)
        .then((response) => {
          const book = response.data;
          if (!book || book.error) return;
          let coverUrl = book.link || "/static/images/nobook.jpg";
          const title = book.title || "Unknown Title";
          const authorName = book.author_id
            ? formatAuthorName(book.author_id)
            : "Unknown Author";
          const truncatedTitle =
            title.length > 20 ? title.substring(0, 20) + "..." : title;
          const truncatedAuthor =
            authorName.length > 20
              ? authorName.substring(0, 20) + "..."
              : authorName;
          const bookDiv = document.createElement("div");
          bookDiv.classList.add("bookshelf", "flex", "flex-col", "justify-end");

          if (
            coverUrl ===
            "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
          ) {
            coverUrl = "/static/images/nobook.jpg";
          }

          bookDiv.innerHTML = `
          <div class="book w-full">
            <div class="cover">
              <img src="${coverUrl}" alt="${title}" class="w-full h-full object-cover">
            </div>
            <a class="link" href="/bookPage/${book.book_id}"></a>
          </div>
          <div class="text-left mt-4 flex flex-col gap-[0.5px] whitespace-nowrap">
            <span class="ml-2 text-sm inline-flex font-cover-title">${truncatedTitle}</span>
            <span class="ml-2 text-sm opacity-60 font-cover-author inline-flex ">${truncatedAuthor}</span>
          </div>
        `;
          container.appendChild(bookDiv);

          // Pop up
          const popup = document.createElement("div");
          popup.classList.add(
            "book-popup",
            "absolute",
            "hidden",
            "bg-white",
            "px-6",
            "py-6",
            "shadow-lg",
            "rounded-xl",
            "w-72",
            "text-sm"
          );
          popup.innerHTML = `
              <strong class="font-cover-title text-md">${title}</strong><br>
              <span class="opacity-60 font-cover-author text-md">${authorName}</span><br><br>
              <span class="">${
                book.description
                  ? book.description.substring(0, 300) + "..."
                  : "No description available"
              }</span><br><br>
                ${
                  book.num_pages
                    ? `<span class="bg-gray-800 text-white rounded-full text-xs px-2 py-1 font-cover-author mb-4">${book.num_pages} pages</span>`
                    : ""
                }
            `;
          document.body.appendChild(popup);

          bookDiv.addEventListener("mouseover", (event) => {
            popup.style.left = `${event.pageX + 10}px`;
            popup.style.top = `${event.pageY + 10}px`;
            popup.classList.remove("hidden");
          });

          bookDiv.addEventListener("mousemove", (event) => {
            popup.style.left = `${event.pageX + 10}px`;
            popup.style.top = `${event.pageY + 10}px`;
          });

          bookDiv.addEventListener("mouseleave", () => {
            popup.classList.add("hidden");
          });
        })
        .catch((error) => console.error("Error fetching book details:", error));
    });
  }

  function formatAuthorName(authorId) {
    return authorId.split(".")[1]?.replace(/_/g, " ") || "Unknown Author";
  }

  searchBar.addEventListener("input", () => searchBooks(searchBar.value));
  fetchRecommended();

  const menuButton = document.getElementById("menu-button");
  const menuDropdown = document.getElementById("menu-dropdown");

  menuButton.addEventListener("click", function () {
    menuDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", function (event) {
    if (
      !menuButton.contains(event.target) &&
      !menuDropdown.contains(event.target)
    ) {
      menuDropdown.classList.add("hidden");
    }
  });

  document
    .getElementById("logout-button")
    .addEventListener("click", function () {
      localStorage.removeItem("userSession");
      window.location.href = "/welcome";
    });
});

document.getElementById("logout-button").addEventListener("click", function () {
  fetch("/logout", {
    method: "POST",
    credentials: "include", // Important: Sends cookies with the request
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.status === "success") {
        localStorage.removeItem("userSession"); // Clear frontend storage
        document.cookie =
          "sessionToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC;"; // Clear session cookie
        window.location.href = "/welcome"; // Redirect to welcome page
      }
    })
    .catch((error) => console.error("Logout error:", error));
});
