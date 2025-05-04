import os
import json
import secrets
import time
from functools import wraps

from flask import (Flask, render_template, request, jsonify,
                   redirect, url_for, flash, session, g)
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import FlaskForm
from flask_wtf.csrf import CSRFProtect
from wtforms import StringField, PasswordField, SubmitField, URLField, TextAreaField
from wtforms.validators import DataRequired, Length, EqualTo, ValidationError, Optional, URL
from werkzeug.security import generate_password_hash, check_password_hash
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', secrets.token_hex(16))
app.config['WTF_CSRF_ENABLED'] = True
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL',
    'sqlite:///locations.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
csrf = CSRFProtect(app)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    avatar_url = db.Column(db.String(255), nullable=True)
    social_link = db.Column(db.String(255), nullable=True)
    about_me = db.Column(db.Text, nullable=True)
    location = db.relationship('Location', backref='user', uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<User {self.username}>'

class Location(db.Model):
    __tablename__ = 'locations'
    id = db.Column(db.Integer, primary_key=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    city = db.Column(db.String(150), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)

    def __repr__(self):
        return f'<Location {self.city} for User ID {self.user_id}>'


class RegistrationForm(FlaskForm):
    username = StringField('Имя пользователя', validators=[DataRequired(), Length(min=4, max=25)])
    password = PasswordField('Пароль', validators=[DataRequired(), Length(min=6)])
    confirm_password = PasswordField('Подтвердите пароль', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Зарегистрироваться')
    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user: raise ValidationError('Имя пользователя занято.')

class LoginForm(FlaskForm):
    username = StringField('Имя пользователя', validators=[DataRequired()])
    password = PasswordField('Пароль', validators=[DataRequired()])
    submit = SubmitField('Войти')

class EditProfileForm(FlaskForm):
    avatar_url = URLField('URL Аватара', validators=[Optional(), URL()])
    social_link = URLField('Ссылка на соцсеть', validators=[Optional(), URL()])
    about_me = TextAreaField('О себе', validators=[Optional(), Length(max=500)])
    submit = SubmitField('Сохранить изменения')


def get_district_center_coords(user_lat, user_lng):
    user_agent = os.environ.get('NOMINATIM_USER_AGENT', 'ProtogenMapApp/1.0 (kovalevd418@gmail.com)') # <-- ЗАМЕНИ!
    geolocator = Nominatim(user_agent=user_agent, timeout=10)
    place_name_found = None; city_context = None; country_context = None
    try:
        location = geolocator.reverse((user_lat, user_lng), exactly_one=True, language='ru', addressdetails=True)
        if not location or not location.raw.get('address'): return None
        address = location.raw['address']
        place_name_found = address.get('suburb', address.get('city_district', address.get('county', address.get('city', address.get('town', address.get('village', address.get('state')))))))
        city_context = address.get('city', address.get('town', address.get('village')))
        country_context = address.get('country')
        if not place_name_found: return None
    except Exception as e: print(f"Geocoding Err Stage 1: {e}"); return None
    time.sleep(1.1)
    try:
        query_parts = [part for part in [place_name_found, city_context if city_context != place_name_found else None, country_context] if part]
        query = ", ".join(query_parts)
        place_location = geolocator.geocode(query, language='ru')
        if place_location:
            return place_name_found, place_location.latitude, place_location.longitude
        else:
            if city_context and place_name_found != city_context:
                 query_city = f"{city_context}, {country_context}" if country_context else city_context
                 time.sleep(1.1); city_location = geolocator.geocode(query_city, language='ru')
                 if city_location: return place_name_found, city_location.latitude, city_location.longitude
            return None
    except Exception as e: print(f"Geocoding Err Stage 2: {e}"); return None


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if g.user is None: flash('Пожалуйста, войдите для доступа.', 'warning'); return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    return decorated_function

@app.before_request
def load_logged_in_user():
    user_id = session.get('user_id'); g.user = None
    if user_id is not None: g.user = User.query.get(user_id)


@app.route('/')
def index():
    locations_with_users = db.session.query(Location, User).join(User, Location.user_id == User.id).all()
    locations_list = [{'lat': loc.latitude, 'lng': loc.longitude, 'city': loc.city, 'user': user.username} for loc, user in locations_with_users]
    return render_template('index.html', locations_json=json.dumps(locations_list))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if g.user: return redirect(url_for('index'))
    form = RegistrationForm()
    if form.validate_on_submit():
        hashed_password = generate_password_hash(form.password.data)
        new_user = User(username=form.username.data, password_hash=hashed_password)
        try:
            db.session.add(new_user); db.session.commit()
            flash(f'Аккаунт {form.username.data} создан!', 'success'); return redirect(url_for('login'))
        except Exception as e: db.session.rollback(); print(f"Reg Err: {e}"); flash('Ошибка регистрации.', 'danger')
    return render_template('register.html', title='Регистрация', form=form)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if g.user: return redirect(url_for('index'))
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user and check_password_hash(user.password_hash, form.password.data):
            session.clear(); session['user_id'] = user.id
            flash('Вы успешно вошли!', 'success'); next_page = request.args.get('next'); return redirect(next_page or url_for('index'))
        else: flash('Неверное имя или пароль.', 'danger')
    return render_template('login.html', title='Вход', form=form)

@app.route('/logout')
def logout():
    session.pop('user_id', None); g.user = None; flash('Вы вышли.', 'info'); return redirect(url_for('index'))

@app.route('/profile/<username>')
def profile(username):
    user_profile = User.query.filter_by(username=username).first()
    if user_profile is None: flash(f'Пользователь "{username}" не найден.', 'warning'); return redirect(url_for('index'))
    return render_template('profile.html', title=f"Профиль {user_profile.username}", user=user_profile)

@app.route('/edit_profile', methods=['GET', 'POST'])
@login_required
def edit_profile():
    if g.user is None: return redirect(url_for('login'))
    form = EditProfileForm(obj=g.user) # Предзаполняем данными текущего пользователя
    if form.validate_on_submit():
        # Обновляем данные объекта пользователя из формы
        g.user.avatar_url = form.avatar_url.data
        g.user.social_link = form.social_link.data
        g.user.about_me = form.about_me.data
        try:
            db.session.commit() # SQLAlchemy отследит изменения и сохранит их
            flash('Профиль обновлен!', 'success'); return redirect(url_for('profile', username=g.user.username))
        except Exception as e: db.session.rollback(); print(f"Profile Update Err: {e}"); flash('Ошибка обновления.', 'danger')
    return render_template('edit_profile.html', title='Редактировать профиль', form=form)

@app.route('/add_location', methods=['POST'])
@login_required
def add_or_update_location():
    user_id = g.user.id
    try:
        data = request.get_json(); assert data and 'lat' in data and 'lng' in data
        place_details = get_district_center_coords(data['lat'], data['lng'])
        if place_details is None: return jsonify({'status': 'error', 'message': 'Не удалось определить место.'}), 400
        place_name, place_lat, place_lng = place_details

        location = Location.query.filter_by(user_id=user_id).first()
        status_code = 200; action_message = "Ваша метка обновлена!"

        if location:
            location.latitude = place_lat
            location.longitude = place_lng
            location.city = place_name
        else:
            location = Location(latitude=place_lat, longitude=place_lng, city=place_name, user_id=user_id)
            db.session.add(location)
            status_code = 201; action_message = "Ваша метка добавлена!"

        db.session.commit()
        print(f"OK: Метка '{place_name}' ({place_lat}, {place_lng}) UserID={user_id}")
        return jsonify({'status': 'success', 'message': action_message, 'foundCity': place_name, 'placeLat': place_lat, 'placeLng': place_lng }), status_code

    except Exception as e:
        db.session.rollback(); print(f"Add/Update Loc Err: {e}")
        return jsonify({'status': 'error', 'message': 'Ошибка сервера при сохранении метки.'}), 500

@app.route('/delete_location', methods=['POST'])
@login_required
def delete_location():
    user_id = g.user.id
    try:
        location = Location.query.filter_by(user_id=user_id).first()
        if location:
            db.session.delete(location); db.session.commit()
            print(f"Метка UserID={user_id} удалена."); return jsonify({'status': 'success', 'message': 'Ваша метка удалена.'})
        else:
            print(f"Метка UserID={user_id} не найдена."); return jsonify({'status': 'success', 'message': 'Метка не найдена.'})
    except Exception as e:
        db.session.rollback(); print(f"Delete Loc Err: {e}")
        return jsonify({'status': 'error', 'message': 'Ошибка сервера при удалении.'}), 500

with app.app_context():
    print("Создание таблиц SQLAlchemy...")
    db.create_all()
    print("Таблицы созданы/проверены.")

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0')