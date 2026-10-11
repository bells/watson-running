import datetime
import random
import string

from geopy.geocoders import options, Nominatim
from sqlalchemy import (
    Column,
    Float,
    ForeignKey,
    Integer,
    Interval,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()


# random user name 8 letters
def randomword():
    letters = string.ascii_lowercase
    return "".join(random.choice(letters) for i in range(4))


options.default_user_agent = "running_page"
# reverse the location (lat, lon) -> location detail
g = Nominatim(user_agent=randomword())


ACTIVITY_KEYS = [
    "run_id",
    "name",
    "distance",
    "moving_time",
    "type",
    "subtype",
    "start_date",
    "start_date_local",
    "location_country",
    "summary_polyline",
    "average_heartrate",
    "average_speed",
    "elevation_gain",
]


class Activity(Base):
    __tablename__ = "activities"

    run_id = Column(Integer, primary_key=True)
    name = Column(String)
    distance = Column(Float)
    moving_time = Column(Interval)
    elapsed_time = Column(Interval)
    type = Column(String)
    subtype = Column(String)
    start_date = Column(String)
    start_date_local = Column(String)
    location_country = Column(String)
    summary_polyline = Column(String)
    average_heartrate = Column(Float)
    average_speed = Column(Float)
    elevation_gain = Column(Float)
    streak = None
    week_streak = None

    def to_dict(self):
        out = {}
        for key in ACTIVITY_KEYS:
            attr = getattr(self, key)
            if isinstance(attr, (datetime.timedelta, datetime.datetime)):
                out[key] = str(attr)
            else:
                out[key] = attr

        if self.streak:
            out["streak"] = self.streak
        if self.week_streak:
            out["week_streak"] = self.week_streak

        return out


class JoyrunDetail(Base):
    """Private JoyRun detail. Raw responses may contain precise locations."""

    __tablename__ = "joyrun_details"

    run_id = Column(Integer, primary_key=True)
    source = Column(String)
    heartrate_source = Column(String)
    calories_kcal = Column(Float)
    total_steps = Column(Integer)
    sample_interval_seconds = Column(Integer)
    moving_seconds = Column(Integer)
    elapsed_seconds = Column(Integer)
    average_cadence_spm = Column(Float)
    average_stride_m = Column(Float)
    min_heartrate = Column(Integer)
    max_heartrate = Column(Integer)
    average_heartrate = Column(Float)
    min_altitude_m = Column(Float)
    max_altitude_m = Column(Float)
    splits_json = Column(Text)
    step_samples_json = Column(Text)
    heart_rate_samples_json = Column(Text)
    altitude_samples_json = Column(Text)
    pause_json = Column(Text)
    raw_list_json = Column(Text)
    raw_detail_json = Column(Text)
    fetched_at = Column(String)


class Region(Base):
    __tablename__ = "regions"
    region_id = Column(String, primary_key=True)
    country_code = Column(String, nullable=False)
    level = Column(String, nullable=False)
    code_namespace = Column(String, nullable=False)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)
    parent_id = Column(String, ForeignKey("regions.region_id"))
    catalog_version = Column(String, nullable=False)
    __table_args__ = (UniqueConstraint("code_namespace", "level", "code"),)


class RegionAlias(Base):
    __tablename__ = "region_aliases"
    alias = Column(String, primary_key=True)
    region_id = Column(String, ForeignKey("regions.region_id"), primary_key=True)
    parent_scope = Column(String, primary_key=True)
    source = Column(String, nullable=False)
    catalog_version = Column(String, nullable=False)


class GeographyRun(Base):
    __tablename__ = "geography_runs"
    batch_id = Column(String, primary_key=True)
    status = Column(String, nullable=False)
    versions_json = Column(Text, nullable=False)
    counts_json = Column(Text, nullable=False)
    backup_json = Column(Text, nullable=False)
    started_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)


class ActivityRegionSummary(Base):
    __tablename__ = "activity_region_summaries"
    run_id = Column(Integer, ForeignKey("activities.run_id"), primary_key=True)
    provider_json = Column(Text, nullable=False)
    primary_country_id = Column(String, ForeignKey("regions.region_id"))
    primary_province_id = Column(String, ForeignKey("regions.region_id"))
    primary_city_id = Column(String, ForeignKey("regions.region_id"))
    status = Column(String, nullable=False)
    levels_json = Column(Text, nullable=False)
    valid_gps_distance_m = Column(Float)
    input_fingerprint = Column(String, nullable=False)
    route_source = Column(String)
    route_crs = Column(String)
    catalog_version = Column(String, nullable=False)
    boundary_version = Column(String, nullable=False)
    rules_version = Column(String, nullable=False)
    batch_id = Column(String, ForeignKey("geography_runs.batch_id"), nullable=False)
    error_code = Column(String)
    calculated_at = Column(String, nullable=False)


class ActivityRegion(Base):
    __tablename__ = "activity_regions"
    run_id = Column(Integer, ForeignKey("activities.run_id"), primary_key=True)
    region_id = Column(String, ForeignKey("regions.region_id"), primary_key=True)
    distance_m = Column(Float, nullable=False)


class GeographySchema(Base):
    __tablename__ = "geography_schema"
    version = Column(Integer, primary_key=True)


GEOGRAPHY_TABLES = [
    model.__table__
    for model in (
        Region,
        RegionAlias,
        GeographyRun,
        ActivityRegionSummary,
        ActivityRegion,
        GeographySchema,
    )
]


def update_or_create_activity(session, run_activity):
    created = False
    try:
        activity = (
            session.query(Activity).filter_by(run_id=int(run_activity.id)).first()
        )

        current_elevation_gain = 0.0  # default value

        # https://github.com/stravalib/stravalib/blob/main/src/stravalib/strava_model.py#L639C1-L643C41
        if (
            hasattr(run_activity, "total_elevation_gain")
            and run_activity.total_elevation_gain is not None
        ):
            current_elevation_gain = float(run_activity.total_elevation_gain)
        elif (
            hasattr(run_activity, "elevation_gain")
            and run_activity.elevation_gain is not None
        ):
            current_elevation_gain = float(run_activity.elevation_gain)

        if not activity:
            start_point = run_activity.start_latlng
            location_country = getattr(run_activity, "location_country", "")
            # or China for #176 to fix
            if not location_country and start_point or location_country == "China":
                try:
                    location_country = str(
                        g.reverse(
                            f"{start_point.lat}, {start_point.lon}",
                            language="zh-CN",  # type: ignore
                            timeout=15,
                        )
                    )
                # limit (only for the first time)
                except Exception:
                    try:
                        location_country = str(
                            g.reverse(
                                f"{start_point.lat}, {start_point.lon}",
                                language="zh-CN",  # type: ignore
                                timeout=15,
                            )
                        )
                    except Exception:
                        pass

            activity = Activity(
                run_id=run_activity.id,
                name=run_activity.name,
                distance=run_activity.distance,
                moving_time=run_activity.moving_time,
                elapsed_time=run_activity.elapsed_time,
                type=run_activity.type,
                subtype=run_activity.subtype,
                start_date=run_activity.start_date,
                start_date_local=run_activity.start_date_local,
                location_country=location_country,
                average_heartrate=run_activity.average_heartrate,
                average_speed=float(run_activity.average_speed),
                elevation_gain=current_elevation_gain,
                summary_polyline=(
                    run_activity.map and run_activity.map.summary_polyline or ""
                ),
            )
            session.add(activity)
            created = True
        else:
            activity.name = run_activity.name
            activity.distance = float(run_activity.distance)
            activity.moving_time = run_activity.moving_time
            activity.elapsed_time = run_activity.elapsed_time
            activity.type = run_activity.type
            activity.subtype = run_activity.subtype
            activity.average_heartrate = run_activity.average_heartrate
            activity.average_speed = float(run_activity.average_speed)
            activity.elevation_gain = current_elevation_gain
            activity.summary_polyline = (
                run_activity.map and run_activity.map.summary_polyline or ""
            )
    except Exception as e:
        print(f"something wrong with {run_activity.id}")
        print(str(e))

    return created


def add_missing_columns(engine, model):
    inspector = inspect(engine)
    table_name = model.__tablename__
    columns = {col["name"] for col in inspector.get_columns(table_name)}
    missing_columns = []

    for column in model.__table__.columns:
        if column.name not in columns:
            missing_columns.append(column)
    if missing_columns:
        with engine.connect() as conn:
            for column in missing_columns:
                column_type = str(column.type)
                conn.execute(
                    text(
                        f"ALTER TABLE {table_name} ADD COLUMN {column.name} {column_type}"
                    )
                )


def init_db(db_path):
    engine = create_engine(
        f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
    )
    # Geography has an explicit, backup-protected migration; ordinary export and
    # provider sync must continue to work against the legacy schema.
    Base.metadata.create_all(
        engine, tables=[Activity.__table__, JoyrunDetail.__table__]
    )

    # check missing columns
    add_missing_columns(engine, Activity)

    sm = sessionmaker(bind=engine)
    session = sm()
    # apply the changes
    session.commit()
    return session
