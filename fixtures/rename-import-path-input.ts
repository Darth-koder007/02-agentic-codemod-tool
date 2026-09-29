import { debounce } from "lodash";

export const debounced = debounce(() => console.log("hi"), 200);
