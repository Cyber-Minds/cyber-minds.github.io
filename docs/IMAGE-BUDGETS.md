# Course image budgets

`npm run qa:image-budget` checks local images referenced by pages under
`HTML/Courses and Activities`. It counts each unique image file once per page,
so repeated use of the same asset does not inflate that page's total. External
URLs are not fetched. The audit rejects missing local files and paths that
escape the repository.

The default limit is 300,000 bytes per image and 3,000,000 bytes of unique
images per page. A small number of existing instructional images have explicit
per-file ceilings in `scripts/image-budget-exceptions.json`; their ceiling is
the current file size. Optimize those images while preserving labels and other
instructional detail before raising an exception. For new course content,
export raster images below the default limit where the source allows it.

The audit runs in CI when a pull request changes course pages, images, this
audit, or its configuration.
