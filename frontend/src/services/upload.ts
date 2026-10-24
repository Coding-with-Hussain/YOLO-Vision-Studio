import { ApiError, toApiError } from "./errors";

export interface UploadHandle<T> {
  promise: Promise<T>;
  abort: () => void;
}

/**
 * multipart upload through XMLHttpRequest, which (unlike fetch) reports
 * upload progress. ``onProgress`` receives a fraction between 0 and 1.
 */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        reject(toApiError(xhr.status, body, `Upload failed with status ${xhr.status}.`));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", "The upload was interrupted. Check that the backend is running and try again."));
    xhr.onabort = () => reject(new ApiError(0, "ABORTED", "The upload was cancelled."));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
