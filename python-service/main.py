import asyncio
import os
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pydantic import BaseModel, Field


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================

load_dotenv()


# ============================================================
# CONFIGURATION
# ============================================================

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets"
]

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "")

SHEET_RANGE = os.getenv(
    "SHEET_RANGE",
    "Sheet1!A1:C5"
)

POLL_INTERVAL = float(
    os.getenv(
        "POLL_INTERVAL_SECONDS",
        "2"
    )
)

PORT = int(
    os.getenv(
        "PORT",
        "8000"
    )
)

GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv(
    "GOOGLE_SERVICE_ACCOUNT_FILE",
    "service-account.json"
)


if not SPREADSHEET_ID:
    print(
        "WARNING: SPREADSHEET_ID is not configured."
    )


# ============================================================
# REQUEST MODEL
# ============================================================

class TablePayload(BaseModel):
    rows: List[List[str]] = Field(
        ...,
        min_length=1
    )


# ============================================================
# GOOGLE SHEETS SYNC SERVICE
# ============================================================

class SheetSync:

    def __init__(self):

        # Latest data received from Google Sheets
        self.values: List[List[str]] = []

        # Stores the latest error, if any
        self.last_error = None

        # Prevents simultaneous read/write operations
        self.lock = asyncio.Lock()

        # Create Google Sheets API service
        self.service = self._build_service()


    # ========================================================
    # BUILD GOOGLE SHEETS SERVICE
    # ========================================================

    def _build_service(self):

        credentials_file = os.path.abspath(
            GOOGLE_SERVICE_ACCOUNT_FILE
        )

        if not os.path.exists(credentials_file):

            raise RuntimeError(
                "Google service account file not found: "
                + credentials_file
            )

        credentials = (
            service_account
            .Credentials
            .from_service_account_file(
                credentials_file,
                scopes=SCOPES,
            )
        )

        return build(
            "sheets",
            "v4",
            credentials=credentials,
            cache_discovery=False,
        )


    # ========================================================
    # READ DATA FROM GOOGLE SHEETS
    # ========================================================

    def read_sheet(self) -> List[List[str]]:

        response = (
            self.service
            .spreadsheets()
            .values()
            .get(
                spreadsheetId=SPREADSHEET_ID,
                range=SHEET_RANGE,
                majorDimension="ROWS",
            )
            .execute()
        )

        raw_values = response.get(
            "values",
            []
        )

        rows = []

        # Normalize every row to exactly 3 columns
        for row in raw_values:

            normalized = [
                str(cell)
                for cell in row[:3]
            ]

            normalized += [
                ""
            ] * (
                3 - len(normalized)
            )

            rows.append(normalized)

        # IMPORTANT:
        # We do NOT create fake/demo data if
        # Google Sheets is empty.
        #
        # Google Sheets remains the source of truth.

        return rows


    # ========================================================
    # WRITE DATA TO GOOGLE SHEETS
    # ========================================================

    def write_sheet(
        self,
        rows: List[List[str]]
    ) -> List[List[str]]:

        # Validate exactly 3 columns
        if any(
            len(row) != 3
            for row in rows
        ):

            raise ValueError(
                "Every row must contain exactly 3 columns."
            )

        # Write directly to the configured range.
        #
        # We intentionally DO NOT clear the sheet first.
        # This prevents the situation where:
        #
        # clear succeeds
        #       ↓
        # update fails
        #       ↓
        # sheet becomes blank
        #
        self.service \
            .spreadsheets() \
            .values() \
            .update(
                spreadsheetId=SPREADSHEET_ID,
                range=SHEET_RANGE,
                valueInputOption="RAW",
                body={
                    "values": rows
                },
            ) \
            .execute()

        return rows


    # ========================================================
    # POLLING LOOP
    # ========================================================

    async def poll_loop(self):

        while True:

            try:

                # Google API calls are blocking,
                # so run them in a worker thread.
                latest = await asyncio.to_thread(
                    self.read_sheet
                )

                async with self.lock:

                    self.values = latest

                    self.last_error = None

            except Exception as exc:

                self.last_error = str(exc)

                print(
                    "Polling error:",
                    exc
                )

            await asyncio.sleep(
                POLL_INTERVAL
            )


# ============================================================
# GLOBAL SYNC OBJECT
# ============================================================

sync = None


# ============================================================
# FASTAPI LIFESPAN
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    global sync

    # Create Google Sheets service
    sync = SheetSync()

    # Perform an initial Google Sheets read
    try:

        sync.values = await asyncio.to_thread(
            sync.read_sheet
        )

        sync.last_error = None

        print(
            "Initial Google Sheets read successful."
        )

    except Exception as exc:

        sync.last_error = str(exc)

        print(
            "Initial Google Sheets read failed:",
            exc
        )

    # Start background polling
    task = asyncio.create_task(
        sync.poll_loop()
    )

    yield

    # Stop polling when application shuts down
    task.cancel()

    try:

        await task

    except asyncio.CancelledError:

        pass


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Google Sheets Sync Service",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================
# CORS CONFIGURATION
# ============================================================

origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5000,http://localhost:5173",
    ).split(",")
    if origin.strip()
]


app.add_middleware(
    CORSMiddleware,

    allow_origins=origins,

    allow_credentials=False,

    allow_methods=[
        "GET",
        "PUT",
        "OPTIONS"
    ],

    allow_headers=[
        "*"
    ],
)


# ============================================================
# HEALTH ENDPOINT
# ============================================================

@app.get("/health")
async def health():

    return {
        "status": "ok",

        "sheetConfigured": bool(
            SPREADSHEET_ID
        ),

        "pollIntervalSeconds": (
            POLL_INTERVAL
        ),

        "lastError": (
            sync.last_error
            if sync
            else "starting"
        ),
    }


# ============================================================
# GET CURRENT DATA
# ============================================================

@app.get("/data")
async def get_data():

    if sync is None:

        raise HTTPException(
            status_code=503,
            detail="Service is starting"
        )

    # If there is an error and we have
    # never received valid data
    if (
        sync.last_error
        and not sync.values
    ):

        raise HTTPException(
            status_code=502,
            detail=sync.last_error
        )

    async with sync.lock:

        return {
            "rows": sync.values,

            "updatedAt": (
                asyncio
                .get_running_loop()
                .time()
            ),
        }


# ============================================================
# UPDATE GOOGLE SHEET
# ============================================================

@app.put("/data")
async def update_data(
    payload: TablePayload
):

    if sync is None:

        raise HTTPException(
            status_code=503,
            detail="Service is starting"
        )

    rows = payload.rows

    # Validate exactly 3 columns
    if any(
        len(row) != 3
        for row in rows
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Every row must contain "
                "exactly three columns: "
                "A, B and C."
            ),
        )

    try:

        async with sync.lock:

            # Write to Google Sheets
            written = await asyncio.to_thread(
                sync.write_sheet,
                rows
            )

            # Update local snapshot immediately
            # so the website does not have to wait
            # for the next polling cycle.
            sync.values = written

            sync.last_error = None

        return {
            "message": "Saved to Google Sheet",
            "rows": written
        }

    except Exception as exc:

        sync.last_error = str(exc)

        raise HTTPException(
            status_code=502,
            detail=str(exc)
        ) from exc