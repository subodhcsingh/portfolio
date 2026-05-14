// 1. Safe element selection wrapper
export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => document.querySelectorAll(selector);

// 2. Generic click event binder
export const onClick = (id, callback) => {
	const el = document.getElementById(id);
	if (el) el.addEventListener("click", callback);
};

// 3. Generic event listener for any event type
export const onEvent = (id, event, callback) => {
	const el = document.getElementById(id);
	if (el) el.addEventListener(event, callback);
};

// 4. Extract values from an array of element IDs
export const getValues = (ids) => {
	return ids.reduce((acc, id) => {
		const el = document.getElementById(id);
		acc[id] = el ? el.value : null;
		return acc;
	}, {});
};

// 5. Clear values of specified element IDs and focus the first one
export const resetFields = (ids, focusId = null) => {
	ids.forEach((id) => {
		const el = document.getElementById(id);
		if (el) el.value = "";
	});
	if (focusId) {
		const focusEl = document.getElementById(focusId);
		if (focusEl) focusEl.focus();
	}
};
