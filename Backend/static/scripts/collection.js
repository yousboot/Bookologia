document.addEventListener("DOMContentLoaded", () => {
  const userSession = localStorage.getItem("userSession");

  if (!userSession) {
    window.location.href = "/welcome";
    return;
  }
  const collectionList = document.getElementById("collectionList");
  const bookList = document.getElementById("bookList");
  const collectionTitle = document.getElementById("collectionTitle");
  const collectionActions = document.getElementById("collectionActions");
  const renameCollectionBtn = document.getElementById("renameCollectionBtn");
  const deleteCollectionBtn = document.getElementById("deleteCollectionBtn");
  const newCollectionInput = document.getElementById("newCollectionInput");

  let selectedCollectionId = null;

  async function fetchCollections() {
    try {
      const response = await fetch("/collections");

      if (!response.ok) {
        throw new Error(`Failed to fetch collections: ${response.status}`);
      }

      const collections = await response.json();

      if (!Array.isArray(collections)) {
        throw new Error("Invalid response format: Expected an array");
      }

      collectionList.innerHTML = "";

      collections.forEach((collection) => {
        const li = document.createElement("li");
        li.dataset.id = collection.id;
        li.className =
          "cursor-pointer flex justify-between items-center py-2 px-4 bg-gray-100 text-sm rounded-xl bookolor-popup-1 hover:text-white";

        const collectionName = document.createElement("span");
        collectionName.textContent = collection.name;
        collectionName.className = "flex-1 truncate";
        collectionName.onclick = () =>
          loadCollection(collection.id, collection.name);

        const menuButton = document.createElement("span");
        menuButton.textContent = "...";
        menuButton.className =
          "cursor-pointer ml-2 px-2 py-1 text-bold rounded-full bookolor-popup-1 hover:text-white";
        menuButton.onclick = (event) => {
          event.stopPropagation();
          toggleMenu(menu, menuButton);
        };

        const menu = document.createElement("div");
        menu.className =
          "absolute bg-white text-black border rounded shadow-lg mt-4 hidden p-2 text-sm";

        const renameOption = document.createElement("button");
        renameOption.textContent = "Rename";
        renameOption.className =
          "block w-full text-left px-3 py-1 hover:bg-gray-200";
        renameOption.onclick = () =>
          enableRename(li, collection.id, collection.name);

        const deleteOption = document.createElement("button");
        deleteOption.textContent = "Delete";
        deleteOption.className =
          "block w-full text-left px-3 py-1 text-red-500 hover:bg-gray-200";
        deleteOption.onclick = () => confirmDelete(collection.id);

        menu.appendChild(renameOption);
        menu.appendChild(deleteOption);
        li.appendChild(collectionName);
        li.appendChild(menuButton);
        li.appendChild(menu);
        collectionList.appendChild(li);
      });

      if (collections.length > 0) {
        loadCollection(collections[0].id, collections[0].name);
      }
    } catch (error) {
      console.error("Error fetching collections:", error);
    }
  }

  function toggleMenu(menu, button) {
    document.querySelectorAll("#collectionList div").forEach((el) => {
      if (el !== menu) el.classList.add("hidden");
    });

    menu.classList.toggle("hidden");

    const rect = button.getBoundingClientRect();
    menu.style.position = "absolute";
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;

    // Add a global click listener to close menu when clicking outside
    document.addEventListener("click", closeMenuOutside, { once: true });
  }

  function closeMenuOutside(event) {
    const menus = document.querySelectorAll("#collectionList div");
    menus.forEach((menu) => {
      if (
        !menu.contains(event.target) &&
        !menu.previousSibling.contains(event.target)
      ) {
        menu.classList.add("hidden");
      }
    });
  }

  function enableRename(li, collectionId, oldName) {
    document.querySelectorAll("#collectionList li").forEach((el) => {
      el.classList.remove("bookolor-5", "text-white");
    });

    li.classList.add("bookolor-5", "text-white");

    const input = document.createElement("input");
    input.type = "text";
    input.value = oldName;
    input.className =
      "w-3/4 py-1 bookolor-5 text-white outline-none ring-0 focus:ring-0";

    input.onkeypress = async (event) => {
      if (event.key === "Enter") {
        await renameCollection(collectionId, input.value);
        await fetchCollections(); // Refresh collections

        // Reselect the renamed collection
        setTimeout(() => {
          const renamedItem = [
            ...document.querySelectorAll("#collectionList li"),
          ].find((li) => li.querySelector("span")?.textContent === input.value);

          if (renamedItem) renamedItem.click();
        }, 100);
      }
    };

    li.innerHTML = "";
    li.appendChild(input);
    input.focus();
  }

  async function loadCollection(collectionId, name) {
    selectedCollectionId = collectionId;
    collectionTitle.textContent = "";

    // Remove active styles from all collection items
    document.querySelectorAll("#collectionList li").forEach((li) => {
      li.classList.remove("bookolor-5", "text-white");
    });

    // Find the correct <li> element and apply styles
    const selectedItem = [
      ...document.querySelectorAll("#collectionList li"),
    ].find((li) => li.querySelector("span").textContent === name);

    if (selectedItem) selectedItem.classList.add("bookolor-5", "text-white");

    const response = await fetch(`/collection/${collectionId}`);
    const collection = await response.json();
    bookList.innerHTML = "";

    if (collection.bookIds && collection.bookIds.length > 0) {
      const booksData = await fetchBooks(collection.bookIds);
      booksData.forEach((book) => {
        const coverUrl =
          book.thumbnail_url ===
          "https://bookshelvedimg.nyc3.cdn.digitaloceanspaces.com/covers/nobook.jpg"
            ? "/static/images/nobook.jpg"
            : book.thumbnail_url || "/static/images/nobook.jpg";

        const title = book.title || "Unknown Title";
        const authorName = book.author_id
          ? formatAuthorName(book.author_id)
          : "Unknown Author";
        const truncatedTitle =
          title.length > 17 ? title.substring(0, 15) + "..." : title;
        const truncatedAuthor =
          authorName.length > 17
            ? authorName.substring(0, 14) + "..."
            : authorName;

        const bookDiv = document.createElement("div");
        bookDiv.classList.add(
          "bookshelfCollection",
          "flex",
          "flex-col",
          "justify-end"
        );

        bookDiv.innerHTML = `
          <div class="bookCollection w-full">
              <div class="coverCollection">
                  <img src="${coverUrl}" alt="${title}" class="w-full h-full object-cover">
              </div>
              <a class="linkCollection" href="/bookPage/${book.book_id}"></a>
          </div>
          <div class="text-left mt-4 flex flex-col gap-[0.5px] whitespace-nowrap">
              <span class="ml-2 text-sm inline-flex font-cover-title">${truncatedTitle}</span>
              <span class="ml-2 text-sm opacity-60 font-cover-author inline-flex ">${truncatedAuthor}</span>
          </div>
        `;
        bookList.appendChild(bookDiv);
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
      });
    }
  }

  async function fetchBooks(bookIds) {
    if (!bookIds.length) return [];
    const response = await fetch(`/books?ids=${bookIds.join(",")}`);
    return await response.json();
  }

  function formatAuthorName(authorId) {
    return authorId.split(".")[1]?.replace(/_/g, " ") || "Unknown Author";
  }

  async function createCollection(name) {
    if (!name.trim()) return;
    const response = await fetch("/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: name, bookIds: [] }),
    });

    const newCollection = await response.json();
    if (!newCollection || !newCollection.name) {
      console.error(
        "Error: Collection data is missing or malformed",
        newCollection
      );
      return;
    }

    const li = document.createElement("li");
    li.dataset.id = newCollection.id;
    li.className =
      "cursor-pointer flex justify-between items-center p-3 px-6 bg-gray-100 text-sm rounded-xl hover:bg-gray-800 hover:text-white";

    const span = document.createElement("span");
    span.textContent = newCollection.name; // Ensure text is assigned
    span.className = "flex-1 truncate";
    span.onclick = () => loadCollection(newCollection.id, newCollection.name);

    li.appendChild(span);
    collectionList.appendChild(li);

    newCollectionInput.value = "";
  }

  async function renameCollection(collectionId, newName) {
    if (!newName.trim()) return;

    const response = await fetch(`/collection/${collectionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newName }),
    });

    const result = await response.json();
    if (result.status === "success") {
      // Find the existing list item and update its name dynamically
      const li = [...document.querySelectorAll("#collectionList li")].find(
        (li) => li.dataset.id == collectionId
      );
      if (li) {
        li.querySelector("span").textContent = newName;
      }
    } else {
      console.error("Rename failed", result);
    }
  }

  function confirmDelete(collectionId) {
    if (confirm("Are you sure you want to delete this collection?")) {
      deleteCollection(collectionId);
    }
  }

  async function deleteCollection(collectionId) {
    if (!confirm("Are you sure you want to delete this collection?")) return;

    await fetch(`/collection/${collectionId}`, { method: "DELETE" });

    document
      .querySelectorAll("#collectionList div")
      .forEach((menu) => menu.classList.add("hidden"));

    const li = [...document.querySelectorAll("#collectionList li")].find(
      (li) => li.dataset.id == collectionId
    );
    if (li) li.remove();

    fetchCollections();
  }

  newCollectionInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      createCollection(newCollectionInput.value);
    }
  });

  renameCollectionBtn.onclick = () =>
    renameCollection(prompt("Enter new collection name:"));
  deleteCollectionBtn.onclick = deleteCollection;

  fetchCollections();
});
